"""
PikPak Torrent Downloader - Flask Backend
A web application to download torrents using PikPak's cloud service
"""

import asyncio
import json
import os
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from pikpakapi import PikPakApi
import requests

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'pikpak-torrent-downloader-secret-key-change-in-production')
CORS(app, supports_credentials=True)

# Store client instances per session
clients = {}


def get_client():
    """Get or create PikPak client for current session"""
    session_id = session.get('session_id')
    if not session_id or session_id not in clients:
        return None
    return clients[session_id]


def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client = get_client()
        if not client:
            return jsonify({'error': 'Not authenticated'}), 401
        return f(*args, **kwargs)
    return decorated_function


def run_async(coro):
    """Run async function in sync context"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ============== Static Files ==============

@app.route('/')
def serve_index():
    return send_from_directory('static', 'index.html')


# ============== Auth Endpoints ==============

@app.route('/api/login', methods=['POST'])
def login():
    """Login to PikPak"""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    try:
        client = PikPakApi(username=username, password=password)
        run_async(client.login())
        
        # Generate session ID and store client
        import uuid
        session_id = str(uuid.uuid4())
        session['session_id'] = session_id
        clients[session_id] = client
        
        user_info = client.get_user_info()
        return jsonify({
            'success': True,
            'user': {
                'username': user_info.get('username'),
                'user_id': user_info.get('user_id')
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 401


@app.route('/api/logout', methods=['POST'])
def logout():
    """Logout and clear session"""
    session_id = session.get('session_id')
    if session_id and session_id in clients:
        del clients[session_id]
    session.clear()
    return jsonify({'success': True})


@app.route('/api/user', methods=['GET'])
@require_auth
def get_user():
    """Get current user info"""
    client = get_client()
    user_info = client.get_user_info()
    return jsonify({
        'username': user_info.get('username'),
        'user_id': user_info.get('user_id')
    })


# ============== Download Endpoints ==============

@app.route('/api/download', methods=['POST'])
@require_auth
def add_download():
    """Add a magnet link for offline download"""
    client = get_client()
    data = request.get_json()
    magnet_url = data.get('url')
    parent_id = data.get('parent_id')  # Optional folder ID
    name = data.get('name')  # Optional custom name
    
    if not magnet_url:
        return jsonify({'error': 'Magnet URL required'}), 400
    
    try:
        result = run_async(client.offline_download(
            file_url=magnet_url,
            parent_id=parent_id,
            name=name
        ))
        return jsonify({
            'success': True,
            'task': result
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks', methods=['GET'])
@require_auth
def list_tasks():
    """List offline download tasks"""
    client = get_client()
    phase = request.args.getlist('phase') or None
    
    try:
        result = run_async(client.offline_list(phase=phase))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks/<task_id>', methods=['DELETE'])
@require_auth
def delete_task(task_id):
    """Delete a download task"""
    client = get_client()
    delete_files = request.args.get('delete_files', 'false').lower() == 'true'
    
    try:
        run_async(client.delete_tasks(task_ids=[task_id], delete_files=delete_files))
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks/<task_id>/retry', methods=['POST'])
@require_auth
def retry_task(task_id):
    """Retry a failed download task"""
    client = get_client()
    
    try:
        result = run_async(client.offline_task_retry(task_id=task_id))
        return jsonify({
            'success': True,
            'task': result
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============== File Endpoints ==============

@app.route('/api/files', methods=['GET'])
@require_auth
def list_files():
    """List files in PikPak storage"""
    client = get_client()
    parent_id = request.args.get('parent_id')
    page_token = request.args.get('page_token')
    
    try:
        result = run_async(client.file_list(
            parent_id=parent_id,
            next_page_token=page_token
        ))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<file_id>', methods=['GET'])
@require_auth
def get_file_info(file_id):
    """Get file details"""
    client = get_client()
    
    try:
        result = run_async(client.offline_file_info(file_id=file_id))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<file_id>/url', methods=['GET'])
@require_auth
def get_download_url(file_id):
    """Get direct download URL for a file"""
    client = get_client()
    
    try:
        result = run_async(client.get_download_url(file_id=file_id))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/proxy/download/<file_id>', methods=['GET'])
@require_auth
def proxy_download(file_id):
    """Proxy download to force correct filename and headers"""
    client = get_client()
    
    try:
        # Get file info for name and size
        file_info = run_async(client.offline_file_info(file_id=file_id))
        
        # Get download URL
        download_data = run_async(client.get_download_url(file_id=file_id))
        
        # Try different URL fields from API response
        url = download_data.get('web_content_link') or \
              (download_data.get('medias') and download_data['medias'][0].get('link', {}).get('url')) or \
              (download_data.get('links') and list(download_data['links'].values())[0].get('url'))
        
        if not url:
            return jsonify({'error': 'Download URL not found'}), 404
            
        # Stream the file
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
@require_auth
def trash_files():
    """Move files to trash"""
    client = get_client()
    data = request.get_json()
    file_ids = data.get('ids', [])
    
    if not file_ids:
        return jsonify({'error': 'File IDs required'}), 400
    
    try:
        result = run_async(client.delete_to_trash(ids=file_ids))
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/quota', methods=['GET'])
@require_auth
def get_quota():
    """Get storage quota info"""
    client = get_client()
    
    try:
        result = run_async(client.get_quota_info())
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("🚀 PikPak Torrent Downloader")
    print("📂 Open http://localhost:5000 in your browser")
    app.run(debug=True, port=5000)
