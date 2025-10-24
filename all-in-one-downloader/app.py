from flask import Flask, send_from_directory, request, jsonify, send_file
import os
import yt_dlp
import gallery_dl
import shutil
import uuid
import zipfile
import logging

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

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static_files(filename):
    if filename.endswith('.html'):
        return send_from_directory('.', filename)
    return app.send_static_file(filename)

@app.route('/download', methods=['POST'])
def download():
    data = request.get_json()
    url = data.get('url')
    content_type = data.get('type', 'mp4')
    quality = data.get('quality')
    platform = data.get('platform')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

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