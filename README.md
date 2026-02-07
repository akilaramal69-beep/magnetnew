# PikPak Multi-User Downloader

A self-hosted web application that allows multiple users to download torrents/magnets to a **Shared PikPak Premium Account** while maintaining **User Isolation**.

Each user gets their own folder (`/PikPakDownloader/<username>`) and cannot see or access other users' files.

## Features

- 🚀 **Multi-User Support**: Users register and have their own isolated file view.
- 🔒 **Secure Isolation**: Files are segregated by folders on the PikPak cloud.
- 🐳 **Dockerized**: Easy deployment with Docker Compose.
- 📱 **Responsive UI**: Clean, modern interface for managing downloads and files.
- ⚡ **Real-time Updates**: Live progress of downloads.

## Prerequisites

- A **VPS** or local server (Linux/Windows/macOS) with Docker installed.
- A **PikPak Premium Account** (needed for the backend to function efficiently).
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).

## 🛠️ Step-by-Step Installation

### 1. Clone the Repository
```bash
git clone https://github.com/akilaramal69-beep/magnetnew.git
cd magnetnew
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Edit the `.env` file and add your PikPak Premium credentials:
```ini
# Your PikPak Account Credentials (The "Admin" account)
PIKPAK_USERNAME=your_email@example.com
PIKPAK_PASSWORD=your_secure_password

# Flask Security Key (Change this to something random)
SECRET_KEY=change_me_to_random_string
```

### 3. Deploy with Docker
Running with Docker Compose will ask PikePak to log in and set up the database volume.

```bash
docker-compose up -d --build
```

- `-d`: Detached mode (runs in background).
- `--build`: Rebuilds the image if you made changes.

Check logs to ensure everything is running:
```bash
docker-compose logs -f
```

## 📖 internal Usage Guide

1.  **Access the App**: Open your browser and go to `http://<your-server-ip>:5000`.
2.  **Create User**:
    -   Click **"Create an account"** on the login screen.
    -   Enter a username and password.
3.  **Add Download**:
    -   Paste a Magnet link or HTTP URL in the input box.
    -   Click **Add**.
    -   The backend will start the download task on PikPak.
4.  **View Files**:
    -   Once completed, files appear in the **Files** tab.
    -   You can browse and download files directly from the browser.
    -   *Note: You will only see files inside your dedicated folder.*

## 📂 Project Structure

- `app.py`: Main Flask application (API, Auth, Isolation Logic).
- `database.py`: SQLite models for Users and Tasks.
- `static/`: Frontend assets (HTML, JS, CSS).
- `pikpak.db`: SQLite database (persisted via Docker volume).

## License

MIT
