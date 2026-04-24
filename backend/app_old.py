from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
import json

app = Flask(__name__)
CORS(app)

# Mock data for team members with hierarchy levels
TEAM_MEMBERS = [
    {"id": "1", "name": "L.E Senevirathna", "role": "Senior Software Engineer", "department": "Engineering", "status": "pending", "hierarchyLevel": 3, "managerId": "101"},
    {"id": "2", "name": "Michael Chen", "role": "Software Engineer", "department": "Engineering", "status": "in-progress", "hierarchyLevel": 3, "managerId": "101"},
    {"id": "3", "name": "Emily Rodriguez", "role": "Product Manager", "department": "Product", "status": "completed", "hierarchyLevel": 2, "managerId": "100"},
    {"id": "4", "name": "Lisa Anderson", "role": "Data Analyst", "department": "Analytics", "status": "in-progress", "hierarchyLevel": 3, "managerId": "102"},
]

# Approvers hierarchy
APPROVERS = {
    "100": {"id": "100", "name": "John Director", "role": "Department Director", "level": 1},
    "101": {"id": "101", "name": "Sarah Manager", "role": "Team Manager", "level": 2},
    "102": {"id": "102", "name": "Mike Senior Manager", "role": "Senior Manager", "level": 2},
    "103": {"id": "103", "name": "CEO", "role": "Chief Executive", "level": 1},
}

# Mock evaluation data
EVALUATIONS = {
    "1": {
        "memberName": "L.E Senevirathna",
        "role": "Asst. General Manager (OL-4)",
        "department": "Custom Brokerage",
        "period": "Annual Performance 2024",
        "categories": [
            {
                "name": "Financial Focus",
                "percentage": 30,
                "kpis": [
                    {"id": "f1", "objective": "Revenue Achievement", "weight": 0.1, "target": "4910.7M", "actual": "4863.1M", "achievePercentage": 99.0, "rating": 2.81},
                    {"id": "f2", "objective": "GP Achievement", "weight": 0.1, "target": "527.52M", "actual": "454.82M", "achievePercentage": 86.2, "rating": 1.0},
                ],
            },
            {
                "name": "Customer Focus",
                "percentage": 30,
                "kpis": [
                    {"id": "c1", "objective": "NPS Index Score", "weight": 0.1, "target": "0.35", "actual": "0.27", "achievePercentage": 78.0, "rating": 2.0},
                    {"id": "c2", "objective": "GP on Personal Sales", "weight": 0.04, "target": "-", "actual": "High", "achievePercentage": 100, "rating": 5.0},
                ],
            },
            {
                "name": "Human Resources Focus",
                "percentage": 40,
                "kpis": [
                    {"id": "h1", "objective": "Statutory & Legal Compliance", "weight": 0.2, "target": "100%", "actual": "100%", "achievePercentage": 100, "rating": 3.0},
                    {"id": "h2", "objective": "360 Degree Feedback", "weight": 0.05, "target": "0.85", "actual": "0.81", "achievePercentage": 95.2, "rating": 3.0},
                ],
            },
        ],
    }
}

# Storage for submitted evaluations
SUBMITTED_EVALUATIONS = []

@app.route("/")
def home():
    return jsonify({"message": "PMS Backend Running!"})

@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

@app.route("/api/team-members", methods=["GET"])
def get_team_members():
    """Get all team members"""
    return jsonify(TEAM_MEMBERS)

@app.route("/api/team-members/<member_id>", methods=["GET"])
def get_team_member(member_id):
    """Get a specific team member"""
    member = next((m for m in TEAM_MEMBERS if m["id"] == member_id), None)
    if member:
        return jsonify(member)
    return jsonify({"error": "Team member not found"}), 404

@app.route("/api/evaluations/<member_id>", methods=["GET"])
def get_evaluation(member_id):
    """Get evaluation data for a team member"""
    evaluation = EVALUATIONS.get(member_id)
    if evaluation:
        return jsonify(evaluation)
    
    # Return default evaluation structure for members without specific data
    return jsonify({
        "memberName": f"Team Member {member_id}",
        "role": "Team Member",
        "department": "Department",
        "period": "Annual Performance 2024",
        "categories": [],
    })

@app.route("/api/evaluation/submit", methods=["POST"])
def submit_evaluation():
    """Submit an evaluation"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    # Validate required fields
    required_fields = ["memberId", "memberName", "categories"]
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    # Store the evaluation
    evaluation_record = {
        "id": len(SUBMITTED_EVALUATIONS) + 1,
        "timestamp": request.headers.get("X-Timestamp", ""),
        **data
    }
    SUBMITTED_EVALUATIONS.append(evaluation_record)
    
    # Update team member status to completed
    for member in TEAM_MEMBERS:
        if member["id"] == data["memberId"]:
            member["status"] = "completed"
            break
    
    return jsonify({
        "success": True,
        "message": "Evaluation submitted successfully",
        "evaluationId": evaluation_record["id"]
    }), 201

@app.route("/api/dashboard-stats", methods=["GET"])
def get_dashboard_stats():
    """Get dashboard statistics"""
    total_evaluations = len(TEAM_MEMBERS)
    completed = len([m for m in TEAM_MEMBERS if m["status"] == "completed"])
    pending = len([m for m in TEAM_MEMBERS if m["status"] == "pending"])
    in_progress = len([m for m in TEAM_MEMBERS if m["status"] == "in-progress"])
    
    return jsonify({
        "totalEvaluations": total_evaluations,
        "completed": completed,
        "pending": pending,
        "inProgress": in_progress,
    })

@app.route("/api/evaluations/<member_id>/feedback", methods=["GET"])
def get_ai_feedback(member_id):
    """Get AI/admin feedback for a team member"""
    feedback_map = {
        "1": f"Team member is performing strongly in Statutory Compliance and Personal Sales. However, GP Achievement (86.2%) is currently the primary bottleneck.",
        "2": "Consistent performer with room for improvement in customer satisfaction metrics.",
        "3": "Excellent overall performance across all categories.",
        "4": "Strong analytical skills demonstrated. Consider developing leadership capabilities.",
    }
    
    feedback = feedback_map.get(member_id, "No specific feedback available")
    recommendation_map = {
        "1": "Initiate a cost-audit in the Brokerage department to identify margin leakages. Increasing NPS from 0.27 to 0.35 should be the focus for H2.",
        "2": "Focus on customer engagement initiatives. Consider mentoring from senior team members.",
        "3": "Maintain current performance levels. Consider taking on more complex projects.",
        "4": "Encourage participation in leadership development programs.",
    }
    
    recommendation = recommendation_map.get(member_id, "Continue current trajectory")
    
    return jsonify({
        "feedback": feedback,
        "recommendation": recommendation,
    })

if __name__ == "__main__":
    app.run(debug=True, port=5001)