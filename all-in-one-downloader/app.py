from flask import Flask, request, jsonify, send_file, session, send_from_directory
from dotenv import load_dotenv
import os
import yt_dlp
import gallery_dl
import shutil
import uuid
import zipfile
import logging
import razorpay
import json
import firebase_admin
from firebase_admin import credentials, auth, firestore
from functools import wraps
from whitenoise import WhiteNoise

# --- Load Environment Variables ---
load_dotenv()

# --- Initialize Firebase Admin SDK ---
cred_path = os.getenv('FIREBASE_CREDENTIALS_PATH')
db = None

try:
    if not cred_path or not os.path.exists(cred_path):
        raise ValueError("FIREBASE_CREDENTIALS_PATH is not set or the file does not exist.")

    cred = credentials.Certificate(cred_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    logging.warning(f"Firebase initialization failed: {e}. Firestore functionality will be disabled.")

# --- Initialize Flask App ---
# We disable Flask's default static handling to let WhiteNoise take over.
app = Flask(__name__, static_folder=None)
app.secret_key = os.getenv('FLASK_SECRET_KEY')

# --- Configure WhiteNoise ---
# WhiteNoise will now serve all files from the root directory, including
# your HTML files and the 'static' directory.
app.wsgi_app = WhiteNoise(app.wsgi_app, root='.')


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
        if not uid: return jsonify({"status": "error", "message": "User not logged in"}), 401
        try:
            auth.get_user(uid)
        except auth.AuthError:
            return jsonify({"status": "error", "message": "Invalid user"}), 401
        return f(*args, **kwargs)
    return decorated_function

# --- API Routes ---

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('user', None)
    return jsonify({"status": "success"})

@app.route('/google-login', methods=['POST'])
def google_login():
    if not db: return jsonify({"status": "error", "message": "Database not configured"}), 500
    token = request.json.get('idToken')
    try:
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']
        user_ref = db.collection('users').document(uid)
        if not user_ref.get().exists:
            user_ref.set({
                'email': decoded_token.get('email'), 'name': decoded_token.get('name'),
                'picture': decoded_token.get('picture'), 'subscribed': False, 'subscription_id': None
            })
        session['user'] = uid
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 401

@app.route('/create-subscription', methods=['POST'])
@login_required
def create_subscription():
    plan_id = request.json.get('plan_id')
    uid = session.get('user')
    subscription = razorpay_client.subscription.create(data={
        'plan_id': plan_id, 'total_count': 12, 'notes': {'firebase_uid': uid}
    })
    return jsonify(subscription)

@app.route('/verify-subscription', methods=['POST'])
def verify_subscription():
    if not db: return jsonify({"status": "error", "message": "Database not configured"}), 500
    data = request.json
    try:
        razorpay_client.utility.verify_payment_signature(data)
        uid = session.get('user')
        if not uid: return jsonify({"status": "error", "message": "User not logged in"}), 401
        db.collection('users').document(uid).update({
            'subscribed': True, 'subscription_id': data['razorpay_subscription_id']
        })
        return jsonify({'status': 'success'})
    except razorpay.errors.SignatureVerificationError:
        return jsonify({'status': 'failure'})

@app.route('/razorpay-webhook', methods=['POST'])
def razorpay_webhook():
    if not db: return jsonify({"status": "error", "message": "Database not configured"}), 500
    data = request.json
    webhook_secret = os.getenv('RAZORPAY_WEBHOOK_SECRET')
    try:
        razorpay_client.utility.verify_webhook_signature(
            request.data.decode('utf-8'), request.headers.get('X-Razorpay-Signature'), webhook_secret
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

@app.route('/status')
def status():
    if not db: return jsonify({"status": "error", "message": "Database not configured"}), 500
    if 'user' in session:
        uid = session.get('user')
        user = db.collection('users').document(uid).get()
        if user.exists:
            user_data = user.to_dict()
            return jsonify({
                'logged_in': True,
                'user': {'name': user_data.get('name'), 'picture': user_data.get('picture')},
                'subscribed': user_data.get('subscribed', False)
            })
    return jsonify({'logged_in': False})

@app.route('/download', methods=['POST'])
def download():
    data = request.json
    url = data.get('url')
    content_type = data.get('type', 'mp4')
    quality = data.get('quality')
    platform = data.get('platform')

    if not url: return jsonify({'error': 'URL is required'}), 400

    PREMIUM_PLATFORMS = ['Vimeo']
    if platform in PREMIUM_PLATFORMS:
        uid = session.get('user')
        if not uid: return jsonify({'error': 'Login required for premium platforms'}), 401
        if not db: return jsonify({"status": "error", "message": "Database not configured"}), 500
        user = db.collection('users').document(uid).get()
        if not user.exists or not user.to_dict().get('subscribed'):
            return jsonify({'error': 'Subscription required for premium platforms'}), 403

    TEMP_DIR = '/tmp/temp_downloads'
    if not os.path.exists(TEMP_DIR): os.makedirs(TEMP_DIR)
    request_dir = os.path.join(TEMP_DIR, str(uuid.uuid4()))
    os.makedirs(request_dir)

    try:
        if content_type == 'image':
            gallery_dl.main(['-q', '-d', request_dir, '--no-check-certificate', '--no-mtime', url])
            files = os.listdir(request_dir)
            if not files: raise Exception("No files downloaded")
            if len(files) > 1:
                zip_path = os.path.join(TEMP_DIR, f"JusDown_{uuid.uuid4()}.zip")
                with zipfile.ZipFile(zip_path, 'w') as zf:
                    for f in files: zf.write(os.path.join(request_dir, f), f)
                return send_file(zip_path, as_attachment=True, download_name="JusDown_Images.zip")
            else:
                return send_file(os.path.join(request_dir, files[0]), as_attachment=True)
        else:
            ydl_opts = {
                'outtmpl': os.path.join(request_dir, '%(title)s.%(ext)s'),
                'nocheckcertificate': True, 'logger': YdlLogger(),
            }
            if content_type == 'mp3':
                ydl_opts.update({'format': 'bestaudio/best', 'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': quality.replace('kb/s', '')}]})
            else:
                ydl_opts['format'] = 'bestvideo[height<=1080]+bestaudio/best'

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                dl_path = ydl.prepare_filename(info)

            final_path = os.path.splitext(dl_path)[0] + '.mp3' if content_type == 'mp3' else dl_path
            return send_file(final_path, as_attachment=True)
    except yt_dlp.utils.DownloadError as e:
        return jsonify({'error': 'Download failed. The content may be private or unavailable.'}), 500
    except Exception as e:
        logging.error(f"Download error: {e}", exc_info=True)
        return jsonify({'error': 'An unexpected error occurred.'}), 500
    finally:
        if os.path.exists(request_dir): shutil.rmtree(request_dir)

# The 'app' object is the entry point for Gunicorn
if __name__ == '__main__':
    app.run(debug=True, port=5001)
