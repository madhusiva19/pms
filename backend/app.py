from flask import Flask, jsonify

app = Flask(__name__)

@app.get("/api/health")
def health():
    return jsonify(status="ok", service="pms-backend")

if __name__ == "__main__":
    app.run(host="127.0.0.1", debug=True, port=5000)