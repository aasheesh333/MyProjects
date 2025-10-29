# How to Deploy Your JusDown Application on Render.com

This guide will walk you through the process of deploying the JusDown application to Render.com, a cloud platform that makes it easy to host web applications. This guide is designed for beginners, so no prior experience with Render is required.

## Prerequisites

Before you begin, make sure you have the following:
1.  **A GitHub Account:** Your application's code should be in a GitHub repository.
2.  **A Render.com Account:** You can sign up for a free account on the [Render.com website](https://render.com/).

---

## Step 1: Create a New Web Service on Render

First, we need to tell Render about our application and where to find the code.

1.  Log in to your **Render.com** account.
2.  From your Dashboard, click the **"New +"** button and select **"Web Service"** from the dropdown menu.

    ![New Web Service](httpss://i.imgur.com/3Z3B8yJ.png)

3.  Render will ask you to connect your GitHub account. If you haven't already, grant it permission to access your repositories.
4.  Find the repository containing your JusDown application in the list and click the **"Connect"** button next to it.

---

## Step 2: Configure Your Web Service

This is the most important step. You need to provide Render with the correct settings so it knows how to build and run your application.

On the configuration page, fill in the fields exactly as described below:

*   **Name:** Give your application a unique name, for example, `jusdown-downloader`. This name will be part of your public URL.
*   **Region:** Choose a geographical region that is closest to you or your target audience.
*   **Branch:** Select the branch you want to deploy. Most commonly, this will be `main` or `master`.
*   **Root Directory:** Leave this field **blank**.
*   **Runtime:** Select **`Node`** from the dropdown menu. Render will automatically detect that this is a Node.js project.
*   **Build Command:** This is the command Render runs to prepare your application. Enter the following:
    ```bash
    sh build.sh
    ```
*   **Start Command:** This is the command Render runs to start your application after it's built. Enter the following:
    ```bash
    node server.js
    ```
*   **Instance Type:** You can select the **`Free`** tier for this project. It's a great way to host personal projects at no cost.

Your final configuration should look like this:

![Render Configuration](httpss://i.imgur.com/0sK8t0D.png)

---

## Step 3: Launch the Deployment

Once you have filled in all the settings, scroll to the bottom of the page and click the **"Create Web Service"** button.

Render will now start the deployment process. You will see a console window showing the live logs. Here, you can watch as Render runs your `build.sh` script to install all the necessary tools and dependencies.

The first deployment may take a few minutes to complete. Be patient!

---

## Step 4: Your Application is Live!

Once the deployment is finished, you will see a **"Live"** status indicator.

At the top of the page, Render will display the public URL for your application (e.g., `https://jusdown-downloader.onrender.com`).

![Live URL](httpss://i.imgur.com/7sL4t1E.png)

You can click this link to visit your live website. Congratulations, you have successfully deployed the JusDown application!

---

### Automatic Redeploys

By default, Render enables auto-deploy. This means that every time you push a new change to your connected GitHub branch, Render will automatically start a new deployment, keeping your live application up-to-date with your latest code.
