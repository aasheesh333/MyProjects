from flask import Flask, send_from_directory, request, jsonify, send_file
import os
import yt_dlp
import shutil
import uuid

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

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    request_dir = os.path.join(TEMP_DIR, str(uuid.uuid4()))
    os.makedirs(request_dir)

    try:
        ydl_opts = {
            'outtmpl': os.path.join(request_dir, '%(title)s.%(ext)s'),
            'nocheckcertificate': True,  # Fix for Vimeo SSL issues
        }

        if content_type == 'image':
            ydl_opts['format'] = 'best'
        elif content_type == 'mp3':
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': quality.replace('kb/s', ''),
            }]
        else: # mp4
            ydl_opts['format'] = f"best[ext=mp4][height<={quality[:-1]}]/best[ext=mp4]/best"

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            original_filepath = ydl.prepare_filename(info)

        if content_type == 'mp3':
            final_filepath = os.path.splitext(original_filepath)[0] + '.mp3'
        else:
            final_filepath = original_filepath

        if not os.path.exists(final_filepath):
             raise Exception("Converted file not found. Check FFmpeg installation.")

        title = info.get('title', 'download')
        ext = 'mp3' if content_type == 'mp3' else info.get('ext', 'mp4')
        if content_type == 'image':
            ext = 'jpg'

        safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in (' ', '-')]).rstrip()
        base_filename = f"JusDown - {safe_title} - {content_type.upper()}"

        if quality:
            base_filename += f" | {quality}"

        max_len = 230 - len(ext) - 1
        final_filename = f"{base_filename[:max_len]}.{ext}"

        mimetype = 'audio/mpeg'
        if content_type == 'mp4':
            mimetype = 'video/mp4'
        elif content_type == 'image':
            mimetype = 'image/jpeg'

        return send_file(
            final_filepath,
            as_attachment=True,
            download_name=final_filename,
            mimetype=mimetype
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(request_dir):
            shutil.rmtree(request_dir)

if __name__ == '__main__':
    app.run(debug=True, port=5001)
