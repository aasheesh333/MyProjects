# How to Set Up the VPS Backend

This guide explains how to deploy and run the backend processing server on a new Ubuntu VPS (e.g., from OVHcloud).

## Step 1: Initial Server Setup

1.  **Connect to your VPS via SSH.**
2.  **Update your system:**
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```
3.  **Install necessary software:**
    -   **Node.js (v18 or later):**
        ```bash
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
        ```
    -   **FFmpeg:**
        ```bash
        sudo apt install ffmpeg -y
        ```
    -   **Git:**
        ```bash
        sudo apt install git -y
        ```
    -   **PM2 (Process Manager):**
        ```bash
        sudo npm install pm2 -g
        ```

## Step 2: Deploy the Code

1.  **Clone your repository:**
    ```bash
    git clone https://github.com/your-username/your-repo-name.git
    cd your-repo-name
    ```
2.  **Navigate to the backend directory:**
    ```bash
    cd vps_backend
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    ```

## Step 3: Configure Environment Variables

1.  **Create a `.env` file:**
    ```bash
    nano .env
    ```
2.  **Add the following variables.** Replace the example values with your own.
    ```env
    # The port the backend server will run on. 5002 is a good default.
    PORT=5002

    # A strong, secret key that the Render.com frontend will use to authenticate.
    # Generate a strong one here: https://www.random.org/strings/
    API_KEY=your_super_secret_api_key

    # The public URL of your VPS, which will be used for download links.
    # This should include the port and point to the downloads folder.
    # Example: http://123.45.67.89:5002 or https://cdn.yourdomain.com
    BASE_URL=http://your_vps_ip:5002
    ```
3.  **Save and exit** (`Ctrl+X`, then `Y`, then `Enter`).

## Step 4: Run the Application with PM2

1.  **Start the server:**
    PM2 will run your server in the background and automatically restart it if it crashes or the VPS reboots.
    ```bash
    pm2 start server.js --name "jusdown-backend"
    ```
2.  **Save the process list:**
    ```bash
    pm2 save
    ```
3.  **Monitor your application:**
    You can check the status and logs of your backend at any time:
    -   **Check status:** `pm2 status`
    -   **View logs:** `pm2 logs jusdown-backend`

## Step 5: Configure Firewall (Optional but Recommended)

Allow traffic only on the necessary ports (SSH, HTTP, etc.).
```bash
sudo ufw allow ssh
sudo ufw allow 5002/tcp  # Your backend port
sudo ufw enable
```

Your backend is now live! Remember to update your Render.com environment variables (`BACKEND_URL`, `API_KEY`) to point to your new VPS.
