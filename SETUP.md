# VPS Setup Guide for JusDown

This guide provides step-by-step instructions to deploy the JusDown application on a Virtual Private Server (VPS).

## 1. Prerequisites

Before you begin, ensure you have:
- A VPS running a modern Linux distribution (e.g., Ubuntu 20.04 or later).
- SSH access to your VPS.
- `git` and `Node.js` (v16 or later) installed on your VPS.

## 2. Install Global Dependencies

These tools are required for the application to run correctly.

### FFmpeg
FFmpeg is used for video and audio conversion.

```bash
sudo apt update
sudo apt install ffmpeg -y
```

### yt-dlp
`yt-dlp` is the core tool used for downloading media from various platforms.

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### PM2 (Process Manager)
PM2 is a production process manager for Node.js applications that will keep your servers running.

```bash
sudo npm install pm2 -g
```

## 3. Deploy the Application

### Clone the Repository
Clone your project repository onto the VPS.

```bash
git clone <your-repository-url>
cd <your-project-directory>
```

### Install Dependencies
The project has two parts (frontend and backend), and you need to install dependencies for both.

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd vps_backend
npm install
cd ..
```

## 4. Configure Environment Variables

The application uses `.env` files for configuration. **Never commit these files to version control.**

### Frontend Server (`.env`)
Create a `.env` file in the root directory of the project:

```bash
nano .env
```

Add the following content, replacing the placeholder values:

```env
# The URL of your backend server
BACKEND_URL=http://<your-vps-ip>:5002

# A secret key to authorize requests between the frontend and backend
API_KEY=your_strong_secret_key_here
```

### Backend Server (`vps_backend/.env`)
Create a `.env` file in the `vps_backend/` directory:

```bash
nano vps_backend/.env
```

Add the following content:

```env
# The base URL where the downloaded files can be accessed
BASE_URL=http://<your-vps-ip>:5002

# The same secret key as used in the frontend .env file
API_KEY=your_strong_secret_key_here
```

## 5. Running the Application with PM2

Using `pm2`, you can start both servers and ensure they automatically restart if they crash.

### Start the Servers

```bash
# Start the frontend server
pm2 start server.js --name "jusdown-frontend"

# Start the backend server
pm2 start vps_backend/server.js --name "jusdown-backend"
```

### Check Server Status
You can check the status of your running applications with:

```bash
pm2 status
```

### View Logs
To view the logs for a specific application:

```bash
# View frontend logs
pm2 logs jusdown-frontend

# View backend logs
pm2 logs jusdown-backend
```

## 6. (Optional) Instagram Private Post Configuration

To enable downloading from private Instagram posts, you need to provide login credentials to `yt-dlp`. The most secure way to do this is by creating a cookies file.

1.  **Log in to Instagram** in your web browser.
2.  **Export your cookies** using a browser extension like "Get cookies.txt LOCALLY".
3.  **Save the cookies** to a file named `instagram.cookies` in the `vps_backend` directory on your VPS.

`yt-dlp` will automatically detect and use this file for authentication.

---

Your JusDown application should now be up and running on your VPS.
