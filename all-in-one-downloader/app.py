from flask import Flask, send_from_directory, request, jsonify, send_file, session, redirect, url_for
import os
from dotenv import load_dotenv
import yt_dlp
import gallery_dl
import shutil
import uuid
import zipfile
import logging
import razorpay
import json
from functools import wraps
import firebase_admin
from firebase_admin import credentials, auth, firestore

# --- Load Environment Variables ---
# Make sure to create a .env file with your credentials
load_dotenv()

# --- Firebase Admin SDK setup ---
# The GOOGLE_APPLICATION_CREDENTIALS environment variable must be set.
firebase_admin.initialize_app()
db = firestore.client()

# --- Custom Logger for yt-dlp and gallery-dl ---
class YdlLogger:
    def debug(self, msg):
        pass
    def warning(self, msg):
        logging.warning(msg)
    def error(self, msg):
        logging.error(msg)

# Create a temporary directory for downloads if it doesn't exist
TEMP_DIR = os.path.join(os.getcwd(), 'temp_downloads')
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.getenv('FLASK_SECRET_KEY')



# --- Firebase User Management ---
@app.route('/google-login', methods=['POST'])
def google_login():
    data = request.get_json()
    token = data.get('idToken')
    try:
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']

        # Check if user exists in Firestore
        user_ref = db.collection('users').document(uid)
        user = user_ref.get()

        if not user.exists:
            # New user, create a profile
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

# --- Razorpay Client ---
razorpay_client = razorpay.Client(auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET")))

from firebase_admin import auth

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

@app.route('/create-subscription', methods=['POST'])
@login_required
def create_subscription():
    data = request.get_json()
    plan_id = data.get('plan_id') # e.g., 'plan_monthly' or 'plan_yearly'
    uid = session.get('user')

    subscription_data = {
        'plan_id': plan_id,
        'total_count': 12, # e.g., 12 monthly payments
        'notes': {
            'firebase_uid': uid
        }
    }
    subscription = razorpay_client.subscription.create(data=subscription_data)
    return jsonify(subscription)

@app.route('/verify-subscription', methods=['POST'])
def verify_subscription():
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
    except razorpay.errors.SignatureVerificationError as e:
        return jsonify({'status': 'failure'})

@app.route('/razorpay-webhook', methods=['POST'])
def razorpay_webhook():
    data = request.get_json()
    webhook_secret = os.getenv('RAZORPAY_WEBHOOK_SECRET')
    try:
        razorpay_client.utility.verify_webhook_signature(
            request.data.decode('utf-8'),
            request.headers.get('X-Razorpay-Signature'),
            webhook_secret
        )
    except razorpay.errors.SignatureVerificationError as e:
        return 'Invalid signature', 400

    event = data['event']
    if event == 'subscription.charged':
        uid = data['payload']['subscription']['entity']['notes']['firebase_uid']
        user_ref = db.collection('users').document(uid)
        user_ref.update({'subscribed': True})
    elif event == 'subscription.halted':
        uid = data['payload']['subscription']['entity']['notes']['firebase_uid']
        user_ref = db.collection('users').document(uid)
        user_ref.update({'subscribed': False})

    return 'OK', 200

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static_files(filename):
    if filename.endswith('.html'):
        return send_from_directory('.', filename)
    return app.send_static_file(filename)

PREMIUM_PLATFORMS = ['Vimeo']

@app.route('/status')
def status():
    if 'user' in session:
        uid = session.get('user')
        user_ref = db.collection('users').document(uid)
        user = user_ref.get()
        if user.exists:
            user_data = user.to_dict()
            return jsonify({
                'logged_in': True,
                'user': {
                    'name': user_data.get('name'),
                    'picture': user_data.get('picture'),
                },
                'subscribed': user_data.get('subscribed', False)
            })
    return jsonify({'logged_in': False})

@app.route('/download', methods=['POST'])
def download():
    data = request.get_json()
    url = data.get('url')
    content_type = data.get('type', 'mp4')
    quality = data.get('quality')
    platform = data.get('platform')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    if platform in PREMIUM_PLATFORMS:
        uid = session.get('user')
        if not uid:
            return jsonify({'error': 'Login required for premium platforms'}), 401

        user_ref = db.collection('users').document(uid)
        user = user_ref.get()

        if not user.exists or not user.to_dict().get('subscribed'):
            return jsonify({'error': 'Subscription required for premium platforms'}), 403

    # --- Server-Side Validation ---
    PLATFORM_PATTERNS = {
        'YouTube': ['youtube.com', 'youtu.be'], 'Instagram': ['instagram.com'],
        'Facebook': ['facebook.com', 'fb.watch'], 'TikTok': ['tiktok.com'],
        'Dailymotion': ['dailymotion.com'], 'Twitter': ['twitter.com', 'x.com'],
        'Vimeo': ['vimeo.com'],
    }

    if platform and platform in PLATFORM_PATTERNS:
        if not any(pat in url for pat in PLATFORM_PATTERNS[platform]):
            return jsonify({'error': 'Please select relevant platform to download content.'}), 400

    request_dir = os.path.join(TEMP_DIR, str(uuid.uuid4()))
    os.makedirs(request_dir)

    try:
        if content_type == 'image':
            command = ['-q', '-d', request_dir, '--no-check-certificate', '--no-mtime', url]
            if gallery_dl.main(command) != 0:
                raise Exception("gallery-dl failed")

            downloaded_files = os.listdir(request_dir)
            if not downloaded_files:
                raise Exception("gallery-dl did not download any files")

            if len(downloaded_files) > 1:
                zip_filename = f"JusDown_Images_{uuid.uuid4()}.zip"
                zip_filepath = os.path.join(TEMP_DIR, zip_filename)
                with zipfile.ZipFile(zip_filepath, 'w') as zipf:
                    for filename in downloaded_files:
                        zipf.write(os.path.join(request_dir, filename), filename)
                return send_file(zip_filepath, as_attachment=True, download_name="JusDown - Image Pack.zip", mimetype='application/zip')
            else:
                filename = downloaded_files[0]
                final_filepath = os.path.join(request_dir, filename)
                base, ext = os.path.splitext(filename)
                ext = ext.lstrip('.')
                safe_title = "".join([c for c in base if c.isalpha() or c.isdigit() or c in (' ', '-')]).rstrip()
                final_filename = f"JusDown - {safe_title}.{ext}"
                mimetype = f'image/{ext}' if ext.lower() in ['jpeg', 'jpg', 'png', 'gif'] else 'application/octet-stream'
                return send_file(final_filepath, as_attachment=True, download_name=final_filename, mimetype=mimetype)
        else:
            ydl_opts = {
                'outtmpl': os.path.join(request_dir, '%(id)s.%(ext)s'),
                'nocheckcertificate': True,
                'logger': YdlLogger(),
                'verbose': True,
            }
            if content_type == 'mp3':
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': quality.replace('kb/s', '')}]
            else:
                # Use a more compatible format selector for social media videos
                ydl_opts['format'] = 'bestvideo+bestaudio/best'

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                original_filepath = ydl.prepare_filename(info)

            final_filepath = os.path.splitext(original_filepath)[0] + '.mp3' if content_type == 'mp3' else original_filepath
            if not os.path.exists(final_filepath):
                raise Exception("Converted file not found. Check FFmpeg installation.")

            title = info.get('title', 'download')
            ext = 'mp3' if content_type == 'mp3' else info.get('ext', 'mp4')
            safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in (' ', '-')]).rstrip()
            base_filename = f"JusDown - {safe_title} - {content_type.upper()}"
            if quality:
                base_filename += f" | {quality}"
            max_len = 230 - len(ext) - 1
            final_filename = f"{base_filename[:max_len]}.{ext}"
            mimetype = 'audio/mpeg' if content_type == 'mp3' else 'video/mp4'
            return send_file(final_filepath, as_attachment=True, download_name=final_filename, mimetype=mimetype)

    except yt_dlp.utils.DownloadError as e:
        logging.error(f"yt-dlp download error: {e}")
        if "login required" in str(e).lower() or "rate-limit" in str(e).lower():
            return jsonify({'error': 'This platform requires a login and is blocking our server. We are working on a solution, but for now, this content cannot be downloaded.'}), 403
        return jsonify({'error': 'Please check your link. The content may be private or unavailable.'}), 500
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}", exc_info=True)
        if "gallery-dl failed" in str(e) or "did not download any files" in str(e):
            return jsonify({'error': 'This platform requires a login and is blocking our server. We are working on a solution, but for now, this content cannot be downloaded.'}), 403
        return jsonify({'error': 'An unexpected error occurred. Please try again.'}), 500
    finally:
        if os.path.exists(request_dir):
            shutil.rmtree(request_dir)

if __name__ == '__main__':
    app.run(debug=True, port=5001)