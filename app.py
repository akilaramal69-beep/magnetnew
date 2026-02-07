import asyncio
import os
import uuid
import logging
from flask import Flask, request, jsonify, session, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from pikpakapi import PikPakApi
from dotenv import load_dotenv
from database import db, User, Task 

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'pikpak-downloader-secret')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///pikpak.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db.init_app(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

CORS(app, supports_credentials=True)

# Global PikPak Client
pikpak_client = None

def get_pikpak_client():
    global pikpak_client
    if pikpak_client is None:
        username = os.environ.get('PIKPAK_USERNAME')
        password = os.environ.get('PIKPAK_PASSWORD')
        if not username or not password:
            logging.error("PIKPAK_USERNAME and PIKPAK_PASSWORD must be set in env")
            return None
        try:
            pikpak_client = PikPakApi(username=username, password=password)
            run_async(pikpak_client.login())
            logging.info("Logged in to PikPak successfully")
        except Exception as e:
            logging.error(f"Failed to login to PikPak: {e}")
            return None
    return pikpak_client

def run_async(coro):
    """Run async function in sync context"""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    if loop.is_running():
         # This handles the case where we might be inside another async loop (though Flask is typically sync)
         # For simple scripts, creating a new loop is safer if not already in one.
         # But `asyncio.run` is better for top-level. 
         # Since we are in Flask (sync), `loop.run_until_complete` is standard.
         pass

    return loop.run_until_complete(coro)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create tables
with app.app_context():
    db.create_all()

# ================= Auth =================

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400

    # Create PikPak folder for user
    client = get_pikpak_client()
    if not client:
        return jsonify({'error': 'Server configuration error'}), 500
    
    try:
        # Create folder: /PikPakDownloader/{username}
        # First ensure /PikPakDownloader exists or find it
        # This part is simplified; usually we need to find root folder or specific parent.
        # Assuming we create in root or specific base folder.
        # For now, let's just create a folder with username in root or a specific base.
        # Improving isolation: Create "PikPakDownloader" first if not exists?    
        # Logic: Try create_folder. 
        folder_creation = run_async(client.create_folder(name=username))
        folder_id = folder_creation.get('file', {}).get('id')
    except Exception as e:
        return jsonify({'error': f'Failed to create user storage: {str(e)}'}), 500

    hashed_pw = generate_password_hash(password)
    new_user = User(username=username, password_hash=hashed_pw, pikpak_folder_id=folder_id)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({'success': True, 'message': 'User registered'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    
    if user and check_password_hash(user.password_hash, password):
        login_user(user)
        return jsonify({'success': True, 'user': {'username': user.username, 'id': user.id}})
    
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})

@app.route('/api/user', methods=['GET'])
@login_required
def get_current_user_info():
    return jsonify({'username': current_user.username, 'id': current_user.id})

# ================= Files =================

@app.route('/api/files', methods=['GET'])
@login_required
def list_files():
    client = get_pikpak_client()
    if not client: return jsonify({'error': 'Backend error'}), 500

    # User can only see their own folder
    # If parent_id is provided, verify it is a child of user's root folder? 
    # For MVP: If parent_id is empty, show user's root folder content. 
    # If parent_id provided, just trust it for now (or strictly require it to be user's subtree - todo for security)
    
    target_folder = request.args.get('parent_id') or current_user.pikpak_folder_id
    page_token = request.args.get('page_token')

    try:
        result = run_async(client.file_list(
            parent_id=target_folder,
            next_page_token=page_token
        ))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ================= Downloads =================

@app.route('/api/download', methods=['POST'])
@login_required
def add_download():
    client = get_pikpak_client()
    data = request.get_json()
    magnet_url = data.get('url')
    
    if not magnet_url: return jsonify({'error': 'Magnet URL required'}), 400

    # Always download to user's folder
    parent_id = current_user.pikpak_folder_id
    
    try:
        result = run_async(client.offline_download(
            file_url=magnet_url,
            parent_id=parent_id
        ))
        
        # Store task in DB mapping to user
        # Note: PikPak task ID is in result['task']['id'] usually
        task_id = result.get('task', {}).get('id')
        if task_id:
            new_task = Task(user_id=current_user.id, pikpak_task_id=task_id, name="New Download")
            db.session.add(new_task)
            db.session.commit()
            
        return jsonify({'success': True, 'task': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks', methods=['GET'])
@login_required
def list_tasks():
    client = get_pikpak_client()
    # List tasks from PikPak (global list potentially) and filter?
    # Or just rely on what we stored in DB?
    # Better: Query tasks from DB for this user, then fetch status for them.
    
    user_tasks = Task.query.filter_by(user_id=current_user.id).all()
    if not user_tasks:
        return jsonify({'tasks': []})

    # Optimization: Maybe filtering efficiently?
    # PikPak `offline_list` returns mixed tasks. 
    # We might just call offline_list and filter by our known task IDs from DB.
    
    try:
        # Fetch mostly recent
        pikpak_tasks = run_async(client.offline_list(limit=100)) 
        # Match with user tasks
        user_task_ids = {t.pikpak_task_id for t in user_tasks}
        
        filtered_tasks = []
        if 'tasks' in pikpak_tasks:
            for t in pikpak_tasks['tasks']:
                if t['id'] in user_task_ids:
                    filtered_tasks.append(t)
        
        return jsonify({'tasks': filtered_tasks, 'next_page_token': pikpak_tasks.get('next_page_token')})
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/api/tasks/<task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    client = get_pikpak_client()
    delete_files = request.args.get('delete_files', 'false').lower() == 'true'
    
    # Verify ownership
    # We query by PikPak task ID (which is passed in URL usually, or our DB ID?)
    # The frontend usually passes the PikPak ID.
    task = Task.query.filter_by(pikpak_task_id=task_id, user_id=current_user.id).first()
    if not task:
        return jsonify({'error': 'Task not found or access denied'}), 404

    try:
        run_async(client.delete_tasks(task_ids=[task_id], delete_files=delete_files))
        
        # Remove from DB
        db.session.delete(task)
        db.session.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>/retry', methods=['POST'])
@login_required
def retry_task(task_id):
    client = get_pikpak_client()
    
    task = Task.query.filter_by(pikpak_task_id=task_id, user_id=current_user.id).first()
    if not task:
        return jsonify({'error': 'Task not found or access denied'}), 404

    try:
        result = run_async(client.offline_task_retry(task_id=task_id))
        return jsonify({'success': True, 'task': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/files/<file_id>', methods=['GET'])
@login_required
def get_file_info(file_id):
    client = get_pikpak_client()
    try:
        result = run_async(client.offline_file_info(file_id=file_id))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/files/<file_id>/url', methods=['GET'])
@login_required
def get_download_url(file_id):
    client = get_pikpak_client()
    try:
        result = run_async(client.get_download_url(file_id=file_id))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/proxy/download/<file_id>', methods=['GET'])
@login_required
def proxy_download(file_id):
    client = get_pikpak_client()
    try:
        file_info = run_async(client.offline_file_info(file_id=file_id))
        download_data = run_async(client.get_download_url(file_id=file_id))
        
        url = download_data.get('web_content_link') or \
              (download_data.get('medias') and download_data['medias'][0].get('link', {}).get('url')) or \
              (download_data.get('links') and list(download_data['links'].values())[0].get('url'))
        
        if not url:
            return jsonify({'error': 'Download URL not found'}), 404
            
        import requests
        req = requests.get(url, stream=True)
        return Response(
            stream_with_context(req.iter_content(chunk_size=1024*1024)),
            headers={
                'Content-Disposition': f'attachment; filename="{file_info.get("name", "download")}"',
                'Content-Type': file_info.get('mime_type', 'application/octet-stream'),
                'Content-Length': file_info.get('size', req.headers.get('Content-Length'))
            }
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/files/trash', methods=['POST'])
@login_required
def trash_files():
    client = get_pikpak_client()
    data = request.get_json()
    file_ids = data.get('ids', [])
    if not file_ids: return jsonify({'error': 'No file IDs'}), 400
    
    try:
        result = run_async(client.delete_to_trash(ids=file_ids))
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/quota', methods=['GET'])
@login_required
def get_quota():
    client = get_pikpak_client()
    try:
        result = run_async(client.get_quota_info())
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/')
def serve_index():
    return send_from_directory('static', 'index.html')

if __name__ == '__main__':
    print("🚀 PikPak Downloader Initialized")
    app.run(debug=True, host='0.0.0.0', port=5000)
