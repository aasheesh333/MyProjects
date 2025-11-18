# JusDown Backend v3 (Axios/Cheerio) Setup Guide

This guide provides simple, step-by-step instructions to set up the new lightweight and scalable JusDown backend on a fresh Ubuntu server.

**Technology Stack:**
- **Node.js:** v20 or higher
- **HTTP Client:** `axios`
- **HTML Parser:** `cheerio`
- **Process Manager:** `pm2`

---

### Step 1: Set Up Your Server

1.  **Install Node.js v20:**
    The new backend requires Node.js 20. Run these commands to install it:
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```

2.  **Install PM2 (Process Manager):**
    PM2 is a powerful tool that will keep your backend running forever and restart it automatically if it crashes.
    ```bash
    sudo npm install -g pm2
    ```

---

### Step 2: Deploy the Backend Code

1.  **Clone Your Project:**
    Find a good location on your server (e.g., `/home/ubuntu/MyProjects`) and clone your project from GitHub.
    ```bash
    cd /home/ubuntu/MyProjects
    git clone https://github.com/your-username/your-repo-name.git
    cd your-repo-name/
    ```

2.  **Navigate to the Backend Directory:**
    All backend code is located in the `vps_backend` folder.
    ```bash
    cd vps_backend
    ```

3.  **Install Dependencies:**
    This command installs all the required libraries (`express`, `axios`, `cheerio`, etc.).
    ```bash
    npm install
    ```

---

### Step 3: Configure Your Environment

1.  **Create and Edit the `.env` File:**
    The `.env` file stores your secret keys and configuration. Create it by copying the example:
    ```bash
    cp .env.example .env
    ```
    *Note: If `.env.example` doesn't exist, create `.env` manually and paste the content below.*

2.  **Set Your Variables:**
    Open the file with a text editor (`nano .env`) and set your variables.
    ```ini
    # JusDown Backend Environment Variables (v3 - Axios)

    # A strong, secret key to secure the API endpoint.
    # The frontend server must provide this key in the 'x-api-key' header.
    API_KEY=Your_Super_Secret_API_Key_Here

    # The public-facing URL of THIS backend server.
    # Replace YOUR_VPS_IP with your server's actual public IP address.
    BASE_URL=http://YOUR_VPS_IP:5002

    # The port this backend server will listen on.
    PORT=5002
    ```
    **IMPORTANT:** The `API_KEY` must be the same in both your frontend and backend configuration.

---

### Step 4: Run the Application with PM2

1.  **Start the Server:**
    From inside the `vps_backend` directory, start the server with PM2.
    ```bash
    pm2 start server.js --name "jusdown-backend-v3"
    ```

2.  **Save the Process List:**
    This makes PM2 automatically restart your app after a server reboot.
    ```bash
    pm2 save
    ```

3.  **Check the Status:**
    You can check if the app is running correctly with:
    ```bash
    pm2 status
    ```
    And view logs with:
    ```bash
    pm2 logs jusdown-backend-v3
    ```

---
---

## ⭐ How to Add a New Platform ⭐

The new backend is designed to be **extremely easy to extend**. You can add support for a new download platform without ever touching the `server.js` file.

### Step 1: Copy the Template

-   Go to the `vps_backend/downloaders/` directory.
-   You will find a file named `_template.js`.
-   Make a copy of this file and **rename it** to the name of the new platform. For example: `dailymotion.js`.
    > The filename is important! `dailymotion.js` will create the `dailymotion` platform identifier.

### Step 2: Edit the New File (`dailymotion.js`)

-   Open your new file (`dailymotion.js`).
-   The file is full of comments explaining exactly what to do.
-   Your only job is to write the logic inside the `download` function to find the Title, Thumbnail, and a direct Download URL from the page's HTML or JSON.
-   You will use `axios` to fetch the page and `cheerio` to parse the HTML.

### Step 3: Restart the Server

-   Once you are done editing, simply restart the backend with PM2:
    ```bash
    pm2 restart jusdown-backend-v3
    ```

**That's it!** The server will automatically detect your new `dailymotion.js` file and will now accept `"platform": "dailymotion"` in API requests.
