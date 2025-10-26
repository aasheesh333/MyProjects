from flask import Flask, request, jsonify, send_file, session
from dotenv import load_dotenv
import os
import yt_dlp
import gallery_dl
import shutil
import uuid
import zipfile
import logging
import razorpay
import firebase_admin
from firebase_admin import credentials, auth, firestore
from functools import wraps

# --- Load Environment Variables ---
load_dotenv()

# --- Initialize Firebase Admin SDK ---
cred_path = os.getenv('FIREBASE_CREDENTIALS_PATH')
if cred_path and os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
else:
    # Handle case where Firebase is not configured; maybe log a warning
    db = None
    logging.warning("Firebase credentials not found. Firestore functionality will be disabled.")

# --- Initialize Flask App ---
app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY')

# --- Razorpay Client ---
razorpay_client = razorpay.Client(auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET")))

# --- Custom Logger ---
class YdlLogger:
    def debug(self, msg): pass
    def warning(self, msg): logging.warning(msg)
    def error(self, msg): logging.error(msg)

# --- Login Required Decorator ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        uid = session.get("user")
        if not uid:
            return jsonify({"status": "error", "message": "User not logged in"}), 401
        try:
            auth.get_user(uid)
        except auth.AuthError:
            return jsonify({"status": "error", "message": "Invalid user"}), 401
        return f(*args, **kwargs)
    return decorated_function

# --- API Routes ---

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user', None)
    return jsonify({"status": "success"})

@app.route('/api/google-login', methods=['POST'])
def google_login():
    if not db:
        return jsonify({"status": "error", "message": "Database not configured"}), 500
    data = request.get_json()
    token = data.get('idToken')
    try:
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']
        user_ref = db.collection('users').document(uid)
        user = user_ref.get()
        if not user.exists:
            user_data = {
                'email': decoded_token.get('email'),
                'name': decoded_token.get('name'),
                'picture': decoded_token.get('picture'),
                'subscribed': False,
                'subscription_id': None
            }
            user_ref.set(user_data)
        session['user'] = uid
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 401

@app.route('/api/create-subscription', methods=['POST'])
@login_required
def create_subscription():
    data = request.get_json()
    plan_id = data.get('plan_id')
    uid = session.get('user')
    subscription_data = {
        'plan_id': plan_id,
        'total_count': 12,
        'notes': {'firebase_uid': uid}
    }
    subscription = razorpay_client.subscription.create(data=subscription_data)
    return jsonify(subscription)

@app.route('/api/verify-subscription', methods=['POST'])
def verify_subscription():
    if not db:
        return jsonify({"status": "error", "message": "Database not configured"}), 500
    data = request.get_json()
    try:
        razorpay_client.utility.verify_payment_signature(data)
        uid = session.get('user')
        if not uid:
            return jsonify({"status": "error", "message": "User not logged in"}), 401
        user_ref = db.collection('users').document(uid)
        user_ref.update({
            'subscribed': True,
            'subscription_id': data['razorpay_subscription_id']
        })
        return jsonify({'status': 'success'})
    except razorpay.errors.SignatureVerificationError:
        return jsonify({'status': 'failure'})

@app.route('/api/razorpay-webhook', methods=['POST'])
def razorpay_webhook():
    if not db:
        return jsonify({"status": "error", "message": "Database not configured"}), 500
    data = request.get_json()
    webhook_secret = os.getenv('RAZORPAY_WEBHOOK_SECRET')
    try:
        razorpay_client.utility.verify_webhook_signature(
            request.data.decode('utf-8'),
            request.headers.get('X-Razorpay-Signature'),
            webhook_secret
        )
    except razorpay.errors.SignatureVerificationError:
        return 'Invalid signature', 400
    event = data['event']
    uid = data['payload']['subscription']['entity']['notes']['firebase_uid']
    user_ref = db.collection('users').document(uid)
    if event == 'subscription.charged':
        user_ref.update({'subscribed': True})
    elif event == 'subscription.halted':
        user_ref.update({'subscribed': False})
    return 'OK', 200

@app.route('/api/status')
def status():
    if not db:
        return jsonify({"status": "error", "message": "Database not configured"}), 500
    if 'user' in session:
        uid = session.get('user')
        user_ref = db.collection('users').document(uid)
        user = user_ref.get()
        if user.exists:
            user_data = user.to_dict()
            return jsonify({
                'logged_in': True,
                'user': {'name': user_data.get('name'), 'picture': user_data.get('picture')},
                'subscribed': user_data.get('subscribed', False)
            })
    return jsonify({'logged_in': False})

@app.route('/api/download', methods=['POST'])
def download():
    data = request.get_json()
    url = data.get('url')
    content_type = data.get('type', 'mp4')
    quality = data.get('quality')
    platform = data.get('platform')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    PREMIUM_PLATFORMS = ['Vimeo']
    if platform in PREMIUM_PLATFORMS:
        uid = session.get('user')
        if not uid:
            return jsonify({'error': 'Login required for premium platforms'}), 401
        if not db:
            return jsonify({"status": "error", "message": "Database not configured"}), 500
        user_ref = db.collection('users').document(uid)
        user = user_ref.get()
        if not user.exists or not user.to_dict().get('subscribed'):
            return jsonify({'error': 'Subscription required for premium platforms'}), 403

    # Use /tmp for serverless environments
    TEMP_DIR = '/tmp/temp_downloads'
    if not os.path.exists(TEMP_DIR):
        os.makedirs(TEMP_DIR)
    request_dir = os.path.join(TEMP_DIR, str(uuid.uuid4()))
    os.makedirs(request_dir)

    try:
        if content_type == 'image':
            gallery_dl.main(['-q', '-d', request_dir, '--no-check-certificate', '--no-mtime', url])
            downloaded_files = os.listdir(request_dir)
            if not downloaded_files:
                raise Exception("No files downloaded by gallery-dl")
            if len(downloaded_files) > 1:
                zip_path = os.path.join(TEMP_DIR, f"JusDown_{uuid.uuid4()}.zip")
                with zipfile.ZipFile(zip_path, 'w') as zipf:
                    for filename in downloaded_files:
                        zipf.write(os.path.join(request_dir, filename), filename)
                return send_file(zip_path, as_attachment=True, download_name="JusDown_Images.zip")
            else:
                file_path = os.path.join(request_dir, downloaded_files[0])
                return send_file(file_path, as_attachment=True)
        else:
            ydl_opts = {
                'outtmpl': os.path.join(request_dir, '%(id)s.%(ext)s'),
                'nocheckcertificate': True,
                'logger': YdlLogger(),
            }
            if content_type == 'mp3':
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': quality.replace('kb/s', '')}]
            else:
                ydl_opts['format'] = 'bestvideo+bestaudio/best'

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                downloaded_file_path = ydl.prepare_filename(info)

            final_filepath = os.path.splitext(downloaded_file_path)[0] + '.mp3' if content_type == 'mp3' else downloaded_file_path
            return send_file(final_filepath, as_attachment=True)

    except Exception as e:
        logging.error(f"Error during download: {e}", exc_info=True)
        return jsonify({'error': 'An unexpected error occurred during download.'}), 500
    finally:
        if os.path.exists(request_dir):
            shutil.rmtree(request_dir)

# This is the entry point for the Vercel serverless function
# The function must be named 'app' for Vercel to detect it.
# All routes are now prefixed with /api/
if __name__ == '__main__':
    # This block is for local testing only. Vercel will not use this.
    app.run(debug=True, port=5001)
