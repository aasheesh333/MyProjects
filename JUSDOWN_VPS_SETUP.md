# JusDown VPS Backend Setup Guide (v3 - Playwright)

This guide will walk you through setting up the new, modern JusDown backend on a fresh Ubuntu VPS. This version uses Node.js v20 and Playwright.

### Step 1: Log in to Your VPS

Connect to your server using SSH. Replace `your_vps_ip` with your server's IP address.
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

# Install Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
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

Go into the backend folder and install the dependencies.
```bash
# Go into the project directory
cd MyProjects/vps_backend

# Install all the required packages (npm, playwright, etc.)
npm install
```

### Step 5: Install Browser Dependencies for Playwright

This is a **critical** step. Playwright needs to download a headless browser and its system dependencies to work correctly.
```bash
# This command can take a few minutes. Do not skip it.
npx playwright install --with-deps
```

### Step 6: Configure Your Environment

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

### Step 7: Start the Backend Server with PM2

Start the server using `pm2`.
```bash
pm2 start server.js --name jusdown-backend-v2
```

### Step 8: Save the PM2 Process

This ensures your backend starts automatically if the VPS reboots.
```bash
pm2 save
```

**Setup Complete!**

Your new backend is now running. You can check its status with `pm2 status` or view its logs with `pm2 logs jusdown-backend-v2`.

**Important:** Remember to update the `.env` file on your **frontend** server to use the new `API_KEY` and set the `BACKEND_URL` to the `BASE_URL` you configured here.
