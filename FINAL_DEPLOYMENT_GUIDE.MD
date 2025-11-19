# Final Deployment Guide: Connecting Frontend to Backend

Great! Your VPS backend is now running. This is the final phase to connect everything and go live.

Follow these steps carefully.

---

### **Step 1: Configure Your Render.com Frontend**

Your Render.com server needs to know where your new backend is and how to talk to it.

1.  **Go to your Render.com Dashboard:** [https://dashboard.render.com/](https://dashboard.render.com/)
2.  Select your **JusDown** web service.
3.  Click on the **"Environment"** tab on the left menu.
4.  You need to add two **Environment Variables**:
    *   **Variable 1:**
        *   **Key:** `BACKEND_URL`
        *   **Value:** `http://YOUR_OVHCLOUD_VPS_IP:5002`
            *   *(Replace `YOUR_OVHCLOUD_VPS_IP` with the actual IP address of your new server)*
    *   **Variable 2:**
        *   **Key:** `API_KEY`
        *   **Value:** `your_super_secret_api_key_12345`
            *   *(This must be the **exact same** secret key you put in the `.env` file on your VPS)*
5.  Click **"Save Changes"**.

---

### **Step 2: Configure Cloudflare CDN (Optional, but HIGHLY Recommended)**

This step will make your downloads much faster for users and hide your server's IP address.

1.  **Log in to your Cloudflare account.**
2.  Select the domain you are using for your project.
3.  Go to the **"DNS"** section.
4.  Click **"Add record"** and create a new **'A' record**:
    *   **Type:** `A`
    *   **Name:** `cdn` (or `downloads`, or any subdomain you like)
    *   **IPv4 address:** `YOUR_OVHCLOUD_VPS_IP`
        *   *(Enter your server's IP address here)*
    *   **Proxy status:** Make sure it is **Proxied** (the cloud icon should be orange).
    *   Click **"Save"**.

5.  **Now, update your VPS to use this new CDN URL:**
    *   **SSH into your OVHcloud VPS.**
    *   Go to the backend directory: `cd your-repo-name/vps_backend`
    *   Edit the `.env` file: `nano .env`
    *   Change the `BASE_URL` to your new Cloudflare subdomain:
        ```env
        # Before
        # BASE_URL=http://your_vps_ip:5002

        # After
        BASE_URL=https://cdn.yourdomain.com
        # (Replace with the subdomain you just created)
        ```
    *   Save the file (`Ctrl+X`, `Y`, `Enter`).
    *   **Restart your backend server** to apply the change:
        ```bash
        pm2 restart jusdown-backend
        ```

---

### **Step 3: Go Live and Test!**

Now it's time to deploy the final changes and test the entire system.

1.  **Deploy on Render:**
    *   Go back to your JusDown service on the **Render.com Dashboard**.
    *   Click the **"Manual Deploy"** button and select **"Deploy latest commit"**.
    *   Wait for the deployment to finish. It will be very quick since the frontend is lightweight.

2.  **Test the Application:**
    *   Open your main website URL (`https://jusdown.onrender.com`).
    *   Paste a video link.
    *   Click "Convert".
    *   You should now see the new animated progress bar with status updates like "queued" and "processing".
    *   Once it's complete, the download should start automatically.

If everything works, congratulations! You have successfully deployed a professional, scalable architecture.
