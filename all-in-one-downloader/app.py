from flask import Flask, send_from_directory, request, jsonify
import os
import yt_dlp

# Initialize the Flask app
# The static_folder is set to the current directory to serve index.html at the root
# and other files like signup.html, etc.
app = Flask(__name__, static_folder='.', static_url_path='')

# Route for the root URL to serve index.html
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

# Generic route to serve other HTML files like signup.html, download.html
@app.route('/<path:filename>')
def serve_static_files(filename):
    # Ensure we only serve HTML files this way to avoid conflicts
    if filename.endswith('.html'):
        return send_from_directory('.', filename)
    # Let Flask's default static file handling take care of other assets like css/js
    return app.send_static_file(filename)

@app.route('/download', methods=['POST'])
def download():
    data = request.get_json()
    url = data.get('url')
    content_type = data.get('type', 'mp4') # Default to mp4 if not provided
    quality = data.get('quality')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    try:
        # Configure yt-dlp options based on user selection
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True, # We only want the URL, not to download the file
        }

        if content_type == 'mp3':
            ydl_opts['format'] = 'bestaudio/best'
            # Note: When getting a URL for a post-processed format like mp3,
            # yt-dlp might not be able to provide a direct link without downloading.
            # This works best when the bestaudio is already mp3.
            # The logic here assumes yt-dlp will find a suitable direct URL.
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': quality.replace('kb/s', ''), # e.g., '320'
            }]
        else: # mp4
            # We want the best single file (pre-merged video+audio) that matches the quality.
            # This selector avoids formats that would require merging.
            ydl_opts['format'] = f"best[ext=mp4][height<={quality[:-1]}]/best[ext=mp4]/best"


        # Extract information
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            # After processing, yt-dlp places the most suitable URL in the top-level 'url' key.
            # The flawed logic of picking from the 'formats' list is removed.
            download_url = info.get('url')

        if download_url:
            return jsonify({'download_url': download_url})
        else:
            return jsonify({'error': 'Could not find a suitable download link.'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Running on port 5001 to avoid potential conflicts with other services
    app.run(debug=True, port=5001)
