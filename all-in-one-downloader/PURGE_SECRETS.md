# How to Remove Secret Files From Your Git History

**Warning: You have committed secret files (`.env` and `firebase_cred.json`) to your public GitHub repository. This is a major security risk.** Anyone on the internet can see them and take over your accounts. Deleting the files with a new commit is **not enough**, as the old commits will still contain the files.

You must follow these steps to permanently remove the files from your history. This guide uses a tool called `bfg-repo-cleaner`, which is the simplest and safest way to do this.

---

### **Step 1: Clone a Fresh Copy of Your Repository**

To ensure you have a clean slate, you must perform these actions in a new folder.

1.  **Open a new terminal** on your computer.
2.  **Navigate to a different directory** from where you usually work (e.g., your Desktop).
3.  **Clone a "bare" copy** of your repository. This is a special type of clone needed for this process. Replace `your-github-username` with your actual GitHub username.
    ```bash
    git clone --bare https://github.com/your-github-username/MyProjects.git
    ```

### **Step 2: Download the BFG Tool**

1.  The BFG tool is a single file. You can download it from the official website: [**BFG Repo-Cleaner Website**](https://rtyley.github.io/bfg-repo-cleaner/)
2.  Download the latest version (e.g., `bfg-1.14.0.jar`) and place it in the **same directory** where you just cloned your repository.

### **Step 3: Run the BFG Cleaner**

1.  **Navigate inside the bare repository folder** you cloned. The folder will be named `MyProjects.git`.
    ```bash
    cd MyProjects.git
    ```
2.  **Run the BFG tool** to remove the `firebase_cred.json` file. Make sure to use the correct version number in the filename.
    ```bash
    java -jar ../bfg-1.14.0.jar --delete-files firebase_cred.json
    ```
3.  **Run the BFG tool again** to remove the `.env` file.
    ```bash
    java -jar ../bfg-1.14.0.jar --delete-files .env
    ```

### **Step 4: Push the Cleaned History to GitHub**

This final step will overwrite the history on your public repository, permanently removing the secret files.

1.  While still inside the `MyProjects.git` directory, run this command:
    ```bash
    git push --force
    ```

---

That's it. Your repository history is now clean. You can now delete the `MyProjects.git` folder and the BFG `.jar` file from your computer. From now on, please follow the new deployment guide to manage your secrets securely using Render's environment variables and secret files.
