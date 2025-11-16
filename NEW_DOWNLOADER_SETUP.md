# JusDown New Downloader Setup Guide (v2)

This guide will walk you through setting up the new, multi-library JusDown backend on a fresh Ubuntu VPS. This version does **not** use the system `yt-dlp`.

### Step 1: Log in to Your VPS

Connect to your server using SSH.
```bash
ssh root@your_vps_ip
```

### Step 2: Install Essential Tools

We need `git` to download the code, and `node` & `npm` to run the server.
```bash
# Update package lists
sudo apt-get update

# Install git
sudo apt-get install -y git

# Install Node.js (Version 18.x is recommended)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (a process manager to keep your server running)
sudo npm install -g pm2
```

### Step 3: Download the Project Code

Clone your project from GitHub.
```bash
git clone https://github.com/aasheesh333/MyProjects.git
```

### Step 4: Set Up the Backend

Go into the backend folder and install the new libraries.
```bash
# Go into the project directory
cd MyProjects/vps_backend

# Install all the required packages
npm install
```

### Step 5: Configure Your Environment

Create a `.env` file for your secrets.
```bash
# Create and open the .env file with a text editor
nano .env
```
Copy the following lines into the file. **You must change these values!**

```env
# A strong, random secret key that your frontend will use to connect.
API_KEY=YOUR_SECRET_API_KEY_HERE

# The public URL of THIS server, including the port.
# Example: http://123.45.67.89:5002
BASE_URL=http://YOUR_VPS_IP:5002

# The port the server will run on.
PORT=5002
```
To save the file in `nano`, press `Ctrl+X`, then `Y`, then `Enter`.

### Step 6: Start the Backend Server with PM2

Start the server using `pm2`.
```bash
pm2 start server.js --name jusdown-backend
```

### Step 7: Save the PM2 Process

This ensures your backend starts automatically if the VPS reboots.
```bash
pm2 save
```

**Setup Complete!**

Your new backend is now running. You can check its status with `pm2 status` or view its logs with `pm2 logs jusdown-backend`.

**Important:** Remember to update the `.env` file on your **frontend** server (on Render.com) to match the `API_KEY` and `BACKEND_URL` you chose here. The `BACKEND_URL` should be the same as your `BASE_URL`.
