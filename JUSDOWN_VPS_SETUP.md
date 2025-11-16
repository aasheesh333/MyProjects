# JusDown VPS Backend Setup Guide

This guide will walk you through setting up the new, reliable JusDown backend on a fresh Ubuntu VPS.

### Step 1: Log in to Your VPS

First, connect to your VPS from your computer using SSH. Replace `your_vps_ip` with your server's IP address.
```bash
ssh root@your_vps_ip
```

### Step 2: Install Essential Tools

We need `git` to download the code, `node` and `npm` to run it, and `pm2` to keep it running forever.
```bash
# Update package lists
sudo apt-get update

# Install git
sudo apt-get install -y git

# Install Node.js (Version 18.x is recommended)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install yt-dlp (the downloader) to the correct location
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Install PM2 (a process manager to keep your server running)
sudo npm install -g pm2
```

### Step 3: Download the Project Code

Clone your project from GitHub.
```bash
git clone https://github.com/aasheesh333/MyProjects.git
```

### Step 4: Set Up the Backend

Now, we will go into the backend folder and set everything up.
```bash
# Go into the project directory
cd MyProjects/vps_backend

# Install all the required packages
npm install
```

### Step 5: Configure Your Environment

We need to create a `.env` file to store your secret API key and URLs.
```bash
# Create and open the .env file with a text editor
nano .env
```
Copy the following lines into the file. **You must change these values!**

```env
# A strong, random secret key that your frontend will use to connect.
# Example: MY_SUPER_SECRET_KEY_12345
API_KEY=YOUR_SECRET_API_KEY

# The public URL of THIS server.
# Example: http://123.45.67.89:5002
BASE_URL=http://YOUR_VPS_IP:5002

# The port the server will run on. 5002 is a good choice.
PORT=5002
```
To save the file in `nano`, press `Ctrl+X`, then `Y`, then `Enter`.

### Step 6: Start the Backend Server with PM2

Now, we will start the server using `pm2`. This will make sure it automatically restarts if it ever crashes.
```bash
pm2 start server.js --name jusdown-backend
```

### Step 7: Save the PM2 Process

This makes sure your backend automatically starts when you reboot your VPS.
```bash
pm2 save
```

**Setup Complete!**

Your backend is now running. You can check its status any time with `pm2 status` or view its logs with `pm2 logs jusdown-backend`.

Remember to also update the `.env` file on your **frontend** server (on Render.com) to match the `API_KEY` you chose here.
