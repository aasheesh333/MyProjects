# How to Add Your DataImpulse Proxy Credentials

To avoid being blocked by services like YouTube, this application is designed to route all download requests through a proxy. Follow these simple steps to add your DataImpulse proxy credentials.

## Step 1: Get Your Proxy Credentials

1.  Log in to your DataImpulse dashboard.
2.  Navigate to the section for your proxy service (e.g., "Residential Proxies").
3.  Find your proxy **username**, **password**, **host**, and **port**.

## Step 2: Format the Proxy URL

Your proxy URL must be in the following format:

```
http://USERNAME:PASSWORD@HOST:PORT
```

**Example:**

If your credentials are:
-   **Username:** `dataimpulse_user`
-   **Password:** `secret123`
-   **Host:** `proxy.dataimpulse.com`
-   **Port:** `8200`

Your final proxy URL will be:

```
http://dataimpulse_user:secret123@proxy.dataimpulse.com:8200
```

## Step 3: Add the Proxy URL to Your Project

You need to set this URL as an environment variable named `PROXY_URL`.

### For Your Deployed Application on Render.com:

1.  Go to your service's dashboard on Render.com.
2.  Click on the **"Environment"** tab.
3.  Under **"Environment Variables"**, click **"Add Environment Variable"**.
4.  Enter the following:
    -   **Key:** `PROXY_URL`
    -   **Value:** Your full proxy URL from Step 2.
5.  Click **"Save Changes"**. Render will automatically redeploy your service with the new environment variable.

### For Local Testing on Your Own Computer:

1.  In the project's root directory, create a new file named `.env` (if it doesn't already exist).
2.  Add the following line to the `.env` file:

    ```
    PROXY_URL="your_full_proxy_url_from_step_2"
    ```
    *Replace `your_full_proxy_url_from_step_2` with your actual proxy URL.*

3.  Save the file. The application will automatically load this variable when you run it locally.

That's it! Your application will now route all download requests through your DataImpulse proxy, preventing IP blocks and ensuring reliable performance.
