# How to Add Your DataImpulse Proxy Credentials

To avoid being blocked by services like YouTube, this application is designed to route all download requests through a proxy. Follow these simple steps to add your DataImpulse proxy credentials.

## Step 1: Get Your Proxy Credentials

1.  Log in to your DataImpulse dashboard.
2.  Navigate to the section for your proxy service (e.g., "Residential Proxies").
3.  Find your proxy **username**, **password**, **host**, and **port**.

## Step 2: Format the Proxy URL(s)

You can add one or more proxy URLs.

### Single Proxy

If you are using only one proxy, the format is:
```
http://USERNAME:PASSWORD@HOST:PORT
```

**Example:**
```
http://dataimpulse_user:secret123@proxy.dataimpulse.com:8200
```

### Multiple Proxies (Proxy Rotation)

To use multiple proxies, provide them in a single line, separated by commas (`,`). The application will randomly pick one proxy for each download request.

**This is the recommended way to save your residential proxy bandwidth.**

**Example:**

Let's say you have your main residential proxy and two datacenter proxies:
1.  `http://dataimpulse_user:secret123@proxy.dataimpulse.com:8200`
2.  `http://datacenter_proxy_1.com:8080`
3.  `http://user2:pass2@datacenter_proxy_2.com:9999`

You would combine them into a single line in your `.env` file like this:
```
http://dataimpulse_user:secret123@proxy.dataimpulse.com:8200,http://datacenter_proxy_1.com:8080,http://user2:pass2@datacenter_proxy_2.com:9999
```

## Step 3: Add the Proxy URL(s) to Your Project

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
