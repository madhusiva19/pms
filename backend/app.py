"""
Flask Backend for Performance Management System - Dashboard & Reporting Module
Author: Sanduni
Description: RESTful API for managing performance reports, bell curve analytics, and dashboards
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
import os
from datetime import datetime
from typing import Dict, List, Optional

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Initialize Supabase client
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def calculate_bell_curve_statistics(data: List[Dict]) -> Dict:
    """
    Calculate statistical metrics for bell curve distribution
    
    Args:
        data: List of rating distributions
        
    Returns:
        Dictionary containing statistical analysis
    """
    total_employees = sum(item['employee_count'] for item in data)
    
    # Calculate percentages
    for item in data:
        item['percentage'] = round((item['employee_count'] / total_employees * 100), 2) if total_employees > 0 else 0
    
    return {
        'total_employees': total_employees,
        'distributions': data
    }

def generate_ai_insight(report_data: Dict, report_type: str) -> str:
    """
    Generate AI-powered insights based on performance data
    This is a placeholder - in production, integrate with actual LLM
    
    Args:
        report_data: Performance report data
        report_type: Type of report (mid_year or year_end)
        
    Returns:
        AI-generated insight text
    """
    if report_type == 'mid_year':
        return f"Distribution follows a normal curve with slight right skew. Top {report_data.get('top_performers_percentage', 18)}% performers exceed 4.5 rating. Recommend targeted development programs for the lower 15%"
    else:
        return f"Year-end performance shows improvement across all bands. Top performers increased by 37%. Distribution normalized successfully with 21% in exceptional category"

# ============================================================================
# COUNTRIES API ENDPOINTS
# ============================================================================

@app.route('/api/countries', methods=['GET'])
def get_countries():
    """
    Retrieve all countries with employee and branch statistics
    
    Returns:
        JSON response with list of countries
    """
    try:
        # Query countries from database
        response = supabase.table('countries').select('*').execute()
        
        return jsonify({
            'success': True,
            'data': response.data,
            'count': len(response.data)
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/countries/<country_id>', methods=['GET'])
def get_country_details(country_id: str):
    """
    Get detailed information for a specific country
    
    Args:
        country_id: UUID of the country
        
    Returns:
        JSON response with country details
    """
    try:
        response = supabase.table('countries').select('*').eq('id', country_id).single().execute()
        
        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Country not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': response.data
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/countries', methods=['POST'])
def create_country():
    """
    Create a new country entry
    
    Request Body:
        {
            "name": "India",
            "code": "IN",
            "total_employees": 420,
            "total_branches": 12
        }
    """
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['name', 'code', 'total_employees', 'total_branches']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        response = supabase.table('countries').insert(data).execute()
        
        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 201
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# PERFORMANCE REPORTS API ENDPOINTS
# ============================================================================

@app.route('/api/reports/<country_id>', methods=['GET'])
def get_country_reports(country_id: str):
    """
    Get all performance reports for a specific country
    
    Query Parameters:
        - report_type: Filter by mid_year or year_end
        - year: Filter by specific year
    
    Args:
        country_id: UUID of the country
    """
    try:
        # Build query
        query = supabase.table('performance_reports').select('*').eq('country_id', country_id)
        
        # Apply filters
        report_type = request.args.get('report_type')
        year = request.args.get('year')
        
        if report_type:
            query = query.eq('report_type', report_type)
        if year:
            query = query.eq('report_year', int(year))
        
        response = query.execute()
        
        return jsonify({
            'success': True,
            'data': response.data,
            'count': len(response.data)
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/reports', methods=['POST'])
def create_performance_report():
    """
    Create a new performance report
    
    Request Body:
        {
            "country_id": "uuid",
            "report_type": "mid_year",
            "report_year": 2026,
            "total_evaluated": 385,
            "avg_score": 4.0,
            "top_performers": 68,
            "completion_percentage": 92
        }
    """
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['country_id', 'report_type', 'report_year']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Insert report
        response = supabase.table('performance_reports').insert(data).execute()
        report_id = response.data[0]['id']
        
        # Generate and store AI insight
        insight_text = generate_ai_insight(data, data['report_type'])
        supabase.table('ai_insights').insert({
            'report_id': report_id,
            'insight_text': insight_text,
            'insight_type': 'distribution_analysis'
        }).execute()
        
        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 201
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/reports/<report_id>', methods=['PUT'])
def update_performance_report(report_id: str):
    """
    Update an existing performance report
    
    Args:
        report_id: UUID of the report to update
    """
    try:
        data = request.json
        data['updated_at'] = datetime.utcnow().isoformat()
        
        response = supabase.table('performance_reports').update(data).eq('id', report_id).execute()
        
        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Report not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================================================
# AI INSIGHTS API ENDPOINTS
# ============================================================================

@app.route('/api/insights/<report_id>', methods=['GET'])
def get_ai_insights(report_id: str):
    """
    Get AI-generated insights for a specific report
    
    Args:
        report_id: UUID of the performance report
    """
    try:
        response = supabase.table('ai_insights').select('*').eq('report_id', report_id).execute()
        
        return jsonify({
            'success': True,
            'data': response.data
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# BRANCHES API ENDPOINTS
# ============================================================================

@app.route('/api/branches/<country_id>', methods=['GET'])
def get_branches(country_id: str):
    """
    Get all branches for a specific country with optional search

    Query Parameters:
        - search: Filter branches by name or code (optional)

    Args:
        country_id: UUID of the country
    """
    try:
        # Query branches for the country
        query = supabase.table('branches').select('*').eq('country_id', country_id)

        # Apply search filter if provided
        search_term = request.args.get('search')
        if search_term:
            query = query.ilike('name', f'%{search_term}%')

        response = query.execute()

        return jsonify({
            'success': True,
            'data': response.data,
            'count': len(response.data)
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/branch/<branch_id>', methods=['GET'])
def get_branch_details(branch_id: str):
    """
    Get detailed information for a specific branch

    Args:
        branch_id: UUID of the branch
    """
    try:
        response = supabase.table('branches').select('*').eq('id', branch_id).single().execute()

        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Branch not found'
            }), 404

        return jsonify({
            'success': True,
            'data': response.data
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/branch-by-code/<code>', methods=['GET'])
def get_branch_by_code(code: str):
    try:
        response = supabase.table('branches').select('*').eq('code', code).limit(1).execute()
        if not response.data:
            return jsonify({'success': False, 'error': 'Branch not found'}), 404
        return jsonify({'success': True, 'data': response.data[0]}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/branches', methods=['POST'])
def create_branch():
    """
    Create a new branch

    Request Body:
        {
            "country_id": "uuid",
            "name": "Branch Name",
            "code": "BRANCH_CODE",
            "total_employees": 100
        }
    """
    try:
        data = request.json

        # Validate required fields
        required_fields = ['country_id', 'name', 'code', 'total_employees']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400

        response = supabase.table('branches').insert(data).execute()

        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 201

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# BRANCH PERFORMANCE REPORTS API ENDPOINTS
# ============================================================================

@app.route('/api/branches/<branch_id>/reports', methods=['GET'])
def get_branch_reports(branch_id: str):
    """
    Get all performance reports for a specific branch

    Query Parameters:
        - report_type: Filter by mid_year or year_end
        - year: Filter by specific year

    Args:
        branch_id: UUID of the branch
    """
    try:
        # Build query
        query = supabase.table('branch_performance_reports').select('*').eq('branch_id', branch_id)

        # Apply filters
        report_type = request.args.get('report_type')
        year = request.args.get('year')

        if report_type:
            query = query.eq('report_type', report_type)
        if year:
            query = query.eq('report_year', int(year))

        response = query.execute()

        return jsonify({
            'success': True,
            'data': response.data,
            'count': len(response.data)
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/branch-reports', methods=['POST'])
def create_branch_performance_report():
    """
    Create a new branch performance report

    Request Body:
        {
            "branch_id": "uuid",
            "country_id": "uuid",
            "report_type": "mid_year",
            "report_year": 2026,
            "total_evaluated": 85,
            "avg_score": 3.5,
            "top_performers": 20,
            "completion_percentage": 95
        }
    """
    try:
        data = request.json

        # Validate required fields
        required_fields = ['branch_id', 'country_id', 'report_type', 'report_year']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400

        # Insert report
        response = supabase.table('branch_performance_reports').insert(data).execute()
        report_id = response.data[0]['id']

        # Generate and store AI insight
        insight_text = generate_ai_insight(data, data['report_type'])
        supabase.table('branch_ai_insights').insert({
            'report_id': report_id,
            'insight_text': insight_text,
            'insight_type': 'distribution_analysis'
        }).execute()

        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 201

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/branch-reports/<report_id>', methods=['PUT'])
def update_branch_performance_report(report_id: str):
    """
    Update an existing branch performance report

    Args:
        report_id: UUID of the report to update
    """
    try:
        data = request.json
        data['updated_at'] = datetime.utcnow().isoformat()

        response = supabase.table('branch_performance_reports').update(data).eq('id', report_id).execute()

        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Report not found'
            }), 404

        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================================================
# BRANCH AI INSIGHTS API ENDPOINTS
# ============================================================================

@app.route('/api/branch-insights/<report_id>', methods=['GET'])
def get_branch_ai_insights(report_id: str):
    """
    Get AI-generated insights for a specific branch report

    Args:
        report_id: UUID of the branch performance report
    """
    try:
        response = supabase.table('branch_ai_insights').select('*').eq('report_id', report_id).execute()

        return jsonify({
            'success': True,
            'data': response.data
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# DASHBOARD ANALYTICS API ENDPOINTS
# ============================================================================

@app.route('/api/dashboard/summary/<country_id>', methods=['GET'])
def get_dashboard_summary(country_id: str):
    """
    Get comprehensive dashboard summary for a country
    Includes both mid-year and year-end data
    
    Args:
        country_id: UUID of the country
    """
    try:
        # Get country details
        country = supabase.table('countries').select('*').eq('id', country_id).single().execute()
        
        # Get latest reports
        mid_year_report = supabase.table('performance_reports').select('*').eq('country_id', country_id).eq('report_type', 'mid_year').order('report_year', desc=True).limit(1).execute()
        
        year_end_report = supabase.table('performance_reports').select('*').eq('country_id', country_id).eq('report_type', 'year_end').order('report_year', desc=True).limit(1).execute()
        
        # Compile summary
        summary = {
            'country': country.data,
            'mid_year': mid_year_report.data[0] if mid_year_report.data else None,
            'year_end': year_end_report.data[0] if year_end_report.data else None
        }
        
        return jsonify({
            'success': True,
            'data': summary
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/dashboard/branch-summary/<branch_id>', methods=['GET'])
def get_branch_dashboard_summary(branch_id: str):
    """
    Get comprehensive dashboard summary for a branch
    Includes both mid-year and year-end data

    Args:
        branch_id: UUID of the branch
    """
    try:
        # Get branch details
        branch = supabase.table('branches').select('*').eq('id', branch_id).single().execute()

        # Get latest reports
        mid_year_report = supabase.table('branch_performance_reports').select('*').eq('branch_id', branch_id).eq('report_type', 'mid_year').order('report_year', desc=True).limit(1).execute()

        year_end_report = supabase.table('branch_performance_reports').select('*').eq('branch_id', branch_id).eq('report_type', 'year_end').order('report_year', desc=True).limit(1).execute()

        # Compile summary
        summary = {
            'branch': branch.data,
            'mid_year': mid_year_report.data[0] if mid_year_report.data else None,
            'year_end': year_end_report.data[0] if year_end_report.data else None
        }

        return jsonify({
            'success': True,
            'data': summary
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# SAVED REPORTS API ENDPOINTS (Create & Save Reports feature)
# ============================================================================

@app.route('/api/saved-reports', methods=['GET'])
def list_saved_reports():
    """
    Get all saved reports for the current user

    Query Parameters:
        - report_type: Filter by 'country' or 'branch'
        - country_id: Filter by country ID
        - branch_id: Filter by branch ID
        - limit: Number of results to return (default: 50)
        - offset: Pagination offset (default: 0)
    """
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'user_id query parameter required'
            }), 400

        # Build query
        query = supabase.table('saved_reports').select('*').eq('user_id', user_id)

        # Apply filters
        report_type = request.args.get('report_type')
        country_id = request.args.get('country_id')
        branch_id = request.args.get('branch_id')

        if report_type:
            query = query.eq('report_type', report_type)
        if country_id:
            query = query.eq('country_id', country_id)
        if branch_id:
            query = query.eq('branch_id', branch_id)

        # Apply pagination
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))

        query = query.order('created_at', desc=True).limit(limit).offset(offset)
        response = query.execute()

        return jsonify({
            'success': True,
            'data': response.data,
            'count': len(response.data)
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/saved-reports', methods=['POST'])
def create_saved_report():
    """
    Create a new saved report

    Request Body:
        {
            "user_id": "uuid",
            "report_name": "Q1 2026 India Report",
            "report_description": "Mid-year performance analysis",
            "report_type": "country",
            "country_id": "uuid",
            "report_period": "mid_year",
            "report_year": 2026,
            "metrics_included": ["evaluated", "avg_score", "top_performers"],
            "charts_included": ["bell_curve"],
            "include_ai_insights": true,
            "include_comparison": false,
            "created_by_email": "user@example.com"
        }
    """
    try:
        data = request.json

        # Validate required fields
        required_fields = ['user_id', 'report_name', 'report_type', 'report_period', 'report_year']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': f'Missing required fields. Required: {required_fields}'
            }), 400

        # Validate either country_id or branch_id is provided
        if not data.get('country_id') and not data.get('branch_id'):
            return jsonify({
                'success': False,
                'error': 'Either country_id or branch_id is required'
            }), 400

        # Remove undefined/null values that can cause issues
        data = {k: v for k, v in data.items() if v is not None}

        # Set defaults
        if 'metrics_included' not in data:
            data['metrics_included'] = ['evaluated', 'avg_score', 'top_performers']
        if 'charts_included' not in data:
            data['charts_included'] = ['bell_curve']
        if 'include_ai_insights' not in data:
            data['include_ai_insights'] = True
        if 'include_comparison' not in data:
            data['include_comparison'] = False

        # Handle trend analysis fields
        if 'is_trend_report' not in data:
            data['is_trend_report'] = False
        if 'selected_periods' not in data:
            data['selected_periods'] = []

        # Validate trend report has at least 2 periods
        if data.get('is_trend_report') and len(data.get('selected_periods', [])) < 2:
            return jsonify({
                'success': False,
                'error': 'Trend reports require at least 2 selected periods'
            }), 400

        print(f"[DEBUG] Creating saved report with data: {data}")
        response = supabase.table('saved_reports').insert(data).execute()
        print(f"[DEBUG] Insert response: {response.data}")

        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 201

    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] Failed to create saved report: {error_msg}")
        return jsonify({
            'success': False,
            'error': error_msg,
            'details': repr(e)
        }), 500

@app.route('/api/saved-reports/<saved_report_id>', methods=['GET'])
def get_saved_report(saved_report_id: str):
    """
    Get a specific saved report by ID

    Args:
        saved_report_id: UUID of the saved report
    """
    try:
        response = supabase.table('saved_reports').select('*').eq('id', saved_report_id).single().execute()

        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Saved report not found'
            }), 404

        return jsonify({
            'success': True,
            'data': response.data
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/saved-reports/<saved_report_id>', methods=['PUT'])
def update_saved_report(saved_report_id: str):
    """
    Update an existing saved report

    Args:
        saved_report_id: UUID of the saved report to update
    """
    try:
        data = request.json
        data['updated_at'] = datetime.utcnow().isoformat()

        response = supabase.table('saved_reports').update(data).eq('id', saved_report_id).execute()

        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Saved report not found'
            }), 404

        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/saved-reports/<saved_report_id>', methods=['DELETE'])
def delete_saved_report(saved_report_id: str):
    """
    Delete a saved report

    Args:
        saved_report_id: UUID of the saved report to delete
    """
    try:
        response = supabase.table('saved_reports').delete().eq('id', saved_report_id).execute()

        return jsonify({
            'success': True,
            'message': 'Saved report deleted successfully'
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/saved-reports/<saved_report_id>/download', methods=['POST'])
def log_saved_report_download(saved_report_id: str):
    """
    Log a download of a saved report

    Request Body:
        {
            "user_id": "uuid",
            "file_format": "pdf",
            "user_email": "user@example.com"
        }
    """
    try:
        data = request.json

        if not data.get('user_id'):
            return jsonify({
                'success': False,
                'error': 'user_id is required'
            }), 400

        # Set defaults
        if 'file_format' not in data:
            data['file_format'] = 'pdf'

        # Prepare download log entry
        log_entry = {
            'saved_report_id': saved_report_id,
            'user_id': data['user_id'],
            'file_format': data['file_format'],
            'user_email': data.get('user_email')
        }

        response = supabase.table('saved_report_downloads').insert(log_entry).execute()

        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 201

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/saved-reports/<saved_report_id>/downloads', methods=['GET'])
def get_saved_report_downloads(saved_report_id: str):
    """
    Get download history for a saved report

    Args:
        saved_report_id: UUID of the saved report
    """
    try:
        response = supabase.table('saved_report_downloads').select('*').eq('saved_report_id', saved_report_id).order('download_timestamp', desc=True).execute()

        return jsonify({
            'success': True,
            'data': response.data,
            'count': len(response.data)
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/saved-reports/<saved_report_id>/share', methods=['POST'])
def share_saved_report(saved_report_id: str):
    """
    Share a saved report with other users

    Request Body:
        {
            "shared_with_emails": ["user1@example.com", "user2@example.com"]
        }
    """
    try:
        data = request.json

        if not data.get('shared_with_emails'):
            return jsonify({
                'success': False,
                'error': 'shared_with_emails is required'
            }), 400

        # Update the saved report with sharing info
        update_data = {
            'is_shared': True,
            'shared_with_emails': data['shared_with_emails'],
            'updated_at': datetime.utcnow().isoformat()
        }

        response = supabase.table('saved_reports').update(update_data).eq('id', saved_report_id).execute()

        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Saved report not found'
            }), 404

        return jsonify({
            'success': True,
            'data': response.data[0]
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# TREND ANALYSIS API ENDPOINTS
# ============================================================================

@app.route('/api/saved-reports/<saved_report_id>/trend-data', methods=['GET'])
def get_trend_analysis_data(saved_report_id: str):
    """
    Get trend analysis data for a saved report with multi-period metrics

    Returns:
        - Period-by-period metrics
        - Calculated changes and percentages
        - Trend direction for each metric

    Args:
        saved_report_id: UUID of the saved report
    """
    try:
        # Get the saved report
        report_response = supabase.table('saved_reports').select('*').eq('id', saved_report_id).single().execute()

        if not report_response.data:
            return jsonify({
                'success': False,
                'error': 'Saved report not found'
            }), 404

        report = report_response.data

        # Check if this is a trend report
        if not report.get('is_trend_report'):
            return jsonify({
                'success': False,
                'error': 'This is not a trend analysis report'
            }), 400

        selected_periods = report.get('selected_periods', [])
        if not selected_periods:
            return jsonify({
                'success': False,
                'error': 'No periods selected for trend analysis'
            }), 400

        # If trend_metrics is cached, return it
        if report.get('trend_metrics'):
            return jsonify({
                'success': True,
                'data': report['trend_metrics'],
                'cached': True
            }), 200

        # Fetch metrics for each selected period
        periods_data = []

        for period_str in selected_periods:
            # Parse period string: "mid_year_2025" or "year_end_2025"
            parts = period_str.split('_')
            year = int(parts[-1])
            report_type = '_'.join(parts[:-1])  # 'mid_year' or 'year_end'

            # Fetch report for this period
            if report['report_type'] == 'country':
                period_report = supabase.table('performance_reports').select('*').eq(
                    'country_id', report['country_id']
                ).eq('report_year', year).eq('report_type', report_type).single().execute()
            else:  # branch report
                period_report = supabase.table('branch_performance_reports').select('*').eq(
                    'branch_id', report['branch_id']
                ).eq('report_year', year).eq('report_type', report_type).single().execute()

            if period_report.data:
                data = period_report.data
                periods_data.append({
                    'period': period_str,
                    'year': year,
                    'report_type': report_type,
                    'metrics': {
                        'total_evaluated': data.get('total_evaluated', 0),
                        'avg_score': data.get('avg_score', 0),
                        'top_performers': data.get('top_performers', 0),
                        'completion_percentage': data.get('completion_percentage', 0)
                    }
                })

        if not periods_data:
            return jsonify({
                'success': False,
                'error': 'Could not fetch metrics for selected periods'
            }), 404

        # Calculate changes between periods
        changes = {}
        metrics_to_track = ['total_evaluated', 'avg_score', 'top_performers', 'completion_percentage']

        for metric in metrics_to_track:
            if len(periods_data) > 1:
                first_value = periods_data[0]['metrics'][metric]
                last_value = periods_data[-1]['metrics'][metric]

                if first_value == 0 and last_value == 0:
                    change_value = 0
                    change_pct = 0
                elif first_value == 0:
                    change_value = last_value
                    change_pct = 100
                else:
                    change_value = last_value - first_value
                    change_pct = round((change_value / first_value) * 100, 2)

                # Determine direction
                if change_value > 0:
                    direction = 'up'
                elif change_value < 0:
                    direction = 'down'
                else:
                    direction = 'stable'

                changes[metric] = {
                    'value': round(change_value, 2),
                    'percentage': change_pct,
                    'direction': direction,
                    'label': f"{'+' if change_value >= 0 else ''}{change_value:.2f} ({'+' if change_pct >= 0 else ''}{change_pct}%)"
                }

        # Determine overall trends
        trends = {}
        for metric in ['avg_score', 'top_performers']:
            values = [p['metrics'][metric] for p in periods_data]

            # Calculate trend: improving, declining, or stable
            if len(values) >= 2:
                improving = sum(1 for i in range(1, len(values)) if values[i] > values[i-1])
                declining = sum(1 for i in range(1, len(values)) if values[i] < values[i-1])

                if improving > declining:
                    trends[f'{metric}_trend'] = 'improving'
                elif declining > improving:
                    trends[f'{metric}_trend'] = 'declining'
                else:
                    trends[f'{metric}_trend'] = 'stable'

        # Evaluated trend
        eval_values = [p['metrics']['total_evaluated'] for p in periods_data]
        if len(eval_values) >= 2:
            growing = sum(1 for i in range(1, len(eval_values)) if eval_values[i] > eval_values[i-1])
            declining = sum(1 for i in range(1, len(eval_values)) if eval_values[i] < eval_values[i-1])

            if growing > declining:
                trends['evaluated_trend'] = 'growing'
            elif declining > growing:
                trends['evaluated_trend'] = 'declining'
            else:
                trends['evaluated_trend'] = 'stable'

        # Compile trend analysis data
        trend_analysis = {
            'periods': periods_data,
            'changes': changes,
            'trends': trends
        }

        # Cache the calculated data
        try:
            supabase.table('saved_reports').update({
                'trend_metrics': trend_analysis,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', saved_report_id).execute()
        except:
            # If caching fails, continue anyway
            pass

        return jsonify({
            'success': True,
            'data': trend_analysis,
            'cached': False
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# BRANCH REPORTS (alternate route used by frontend)
# ============================================================================

@app.route('/api/branch-reports/<branch_id>', methods=['GET'])
def get_branch_reports_alt(branch_id: str):
    try:
        query = supabase.table('branch_performance_reports').select('*').eq('branch_id', branch_id)
        if request.args.get('report_type'):
            query = query.eq('report_type', request.args['report_type'])
        if request.args.get('year'):
            query = query.eq('report_year', int(request.args['year']))
        response = query.execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================================
# DEPARTMENTS API
# ============================================================================

@app.route('/api/departments/branch/<branch_id>', methods=['GET'])
def get_departments_by_branch(branch_id: str):
    try:
        response = supabase.table('departments').select('*').eq('branch_id', branch_id).order('name').execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/departments/<dept_id>', methods=['GET'])
def get_department(dept_id: str):
    try:
        response = supabase.table('departments').select('*').eq('id', dept_id).single().execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================================
# SUB-DEPARTMENTS API
# ============================================================================

@app.route('/api/sub-departments/dept/<dept_id>', methods=['GET'])
def get_sub_departments_by_dept(dept_id: str):
    try:
        response = supabase.table('sub_departments').select('*').eq('department_id', dept_id).order('name').execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sub-departments/<sub_dept_id>', methods=['GET'])
def get_sub_department(sub_dept_id: str):
    try:
        response = supabase.table('sub_departments').select('*').eq('id', sub_dept_id).single().execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================================
# EMPLOYEES API
# ============================================================================

@app.route('/api/employees/sub-dept/<sub_dept_id>', methods=['GET'])
def get_employees_by_sub_dept(sub_dept_id: str):
    try:
        response = supabase.table('users').select('*').eq('sub_department_id', sub_dept_id).eq('role', 'employee').order('full_name').execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/employees/<emp_id>', methods=['GET'])
def get_employee(emp_id: str):
    try:
        response = supabase.table('users').select('*').eq('id', emp_id).single().execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================================
# BELL CURVE FROM PERFORMANCE RECORDS (Dynamic)
# ============================================================================

def get_period_dates(period_type: str, year: int):
    """
    Returns start and end dates for a period.
    mid_year:  Jan 1 → Jun 30
    year_end:  Jul 1 → Dec 31
    """
    if period_type == 'mid_year':
        return f"{year}-01-01", f"{year}-06-30"
    else:
        return f"{year}-07-01", f"{year}-12-31"


def calculate_bell_curve_from_scores(records: list) -> list:
    """
    Groups employee final scores into rating ranges and counts them.
    Ranges: 1.0-1.5, 1.5-2.0, ..., 4.5-5.0
    """
    ranges = [
        ('1.0-1.5', 1.0, 1.5),
        ('1.5-2.0', 1.5, 2.0),
        ('2.0-2.5', 2.0, 2.5),
        ('2.5-3.0', 2.5, 3.0),
        ('3.0-3.5', 3.0, 3.5),
        ('3.5-4.0', 3.5, 4.0),
        ('4.0-4.5', 4.0, 4.5),
        ('4.5-5.0', 4.5, 5.0),
    ]

    total = len(records)
    result = []

    for label, low, high in ranges:
        if high == 5.0:
            count = sum(1 for r in records if r.get('total_score') is not None and low <= float(r['total_score']) <= high)
        else:
            count = sum(1 for r in records if r.get('total_score') is not None and low <= float(r['total_score']) < high)

        result.append({
            'rating_range': label,
            'employee_count': count,
            'percentage': round((count / total * 100), 2) if total > 0 else 0
        })

    return result


@app.route('/api/bell-curve-live', methods=['GET'])
def get_bell_curve_live():
    """
    Get live bell curve data computed from performance_summaries table.

    Query Parameters:
        - period_type: 'mid_year' or 'year_end'  (mapped to H1/H2 for DB)
        - year: e.g. 2026
        - scope: 'country' | 'branch' | 'department' | 'sub_department' | 'employee'
        - scope_id: UUID or int ID of the scoped entity
    """
    try:
        period_type = request.args.get('period_type', 'mid_year')
        year        = int(request.args.get('year', datetime.now().year))
        scope       = request.args.get('scope', 'country')
        scope_id    = request.args.get('scope_id')

        if not scope_id:
            return jsonify({'success': False, 'error': 'scope_id is required'}), 400

        # Map frontend period names to database period values
        period_map = {'mid_year': 'H1', 'year_end': 'H2'}
        db_period = period_map.get(period_type, period_type)

        start_date, end_date = get_period_dates(period_type, year)

        # Resolve employee IDs based on scope using updated users table columns
        if scope == 'country':
            users = (
                supabase.table('users')
                .select('id')
                .eq('country_id', scope_id)
                .eq('role', 'employee')
                .execute()
            )
            emp_ids = [u['id'] for u in users.data]

        elif scope == 'branch':
            users = (
                supabase.table('users')
                .select('id')
                .eq('branch_id', scope_id)
                .eq('role', 'employee')
                .execute()
            )
            emp_ids = [u['id'] for u in users.data]

        elif scope == 'department':
            users = (
                supabase.table('users')
                .select('id')
                .eq('department_id', scope_id)
                .eq('role', 'employee')
                .execute()
            )
            emp_ids = [u['id'] for u in users.data]

        elif scope == 'sub_department':
            users = (
                supabase.table('users')
                .select('id')
                .eq('sub_department_id', scope_id)
                .eq('role', 'employee')
                .execute()
            )
            emp_ids = [u['id'] for u in users.data]

        elif scope == 'employee':
            emp_ids = [scope_id]

        else:
            return jsonify({'success': False, 'error': 'Invalid scope'}), 400

        if not emp_ids:
            return jsonify({'success': True, 'data': [], 'total_employees': 0}), 200

        # Fetch scores from performance_summaries
        records = (
            supabase.table('performance_summaries')
            .select('user_id, total_score, period, year')
            .eq('year', year)
            .eq('period', db_period)
            .in_('user_id', emp_ids)
            .execute()
        )

        bell_curve_data = calculate_bell_curve_from_scores(records.data)

        return jsonify({
            'success': True,
            'data': bell_curve_data,
            'total_employees': len(records.data),
            'period_type': period_type,
            'year': year,
            'scope': scope,
            'date_range': {'start': start_date, 'end': end_date}
        }), 200

    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[bell-curve-live] ERROR: {e}\n{error_detail}")
        return jsonify({'success': False, 'error': str(e), 'detail': error_detail}), 500


# ============================================================================
# REPORT METRICS (Dynamic — calculated from performance_summaries + bell curve)
# ============================================================================

@app.route('/api/report-metrics', methods=['GET'])
def get_report_metrics():
    """
    Get total_evaluated, avg_score (weighted by bell curve midpoints), and
    top_performers metrics dynamically for a given scope.

    Query Parameters:
        - period_type: 'mid_year' or 'year_end'
        - year: e.g. 2026
        - scope: 'country' | 'branch' | 'department' | 'sub_department' | 'employee'
        - scope_id: UUID/INT of the scoped entity
        - employee_id: (optional, for sub_dept_admin) — if provided, also returns
                       this employee's score
    """
    try:
        period_type = request.args.get('period_type', 'mid_year')
        year        = int(request.args.get('year', datetime.now().year))
        scope       = request.args.get('scope', 'country')
        scope_id    = request.args.get('scope_id')
        employee_id = request.args.get('employee_id')  # optional

        if not scope_id:
            return jsonify({'success': False, 'error': 'scope_id is required'}), 400

        # Map frontend period names to DB period values
        period_map = {'mid_year': 'H1', 'year_end': 'H2'}
        db_period = period_map.get(period_type, period_type)

        # Resolve employee IDs based on scope (same logic as bell-curve-live)
        if scope == 'country':
            users = (
                supabase.table('users')
                .select('id')
                .eq('country_id', scope_id)
                .eq('role', 'employee')
                .execute()
            )
            emp_ids = [u['id'] for u in users.data]

        elif scope == 'branch':
            users = (
                supabase.table('users')
                .select('id')
                .eq('branch_id', scope_id)
                .eq('role', 'employee')
                .execute()
            )
            emp_ids = [u['id'] for u in users.data]

        elif scope == 'department':
            users = (
                supabase.table('users')
                .select('id')
                .eq('department_id', scope_id)
                .eq('role', 'employee')
                .execute()
            )
            emp_ids = [u['id'] for u in users.data]

        elif scope == 'sub_department':
            users = (
                supabase.table('users')
                .select('id')
                .eq('sub_department_id', scope_id)
                .eq('role', 'employee')
                .execute()
            )
            emp_ids = [u['id'] for u in users.data]

        elif scope == 'employee':
            emp_ids = [scope_id]

        else:
            return jsonify({'success': False, 'error': 'Invalid scope'}), 400

        if not emp_ids:
            return jsonify({
                'success': True,
                'data': {
                    'total_evaluated': 0,
                    'avg_score': 0.0,
                    'top_performers': 0,
                    'employee_score': None
                }
            }), 200

        # Fetch performance_summaries for these users
        summaries = (
            supabase.table('performance_summaries')
            .select('user_id, total_score, period, year')
            .eq('year', year)
            .eq('period', db_period)
            .in_('user_id', emp_ids)
            .execute()
        )

        records = summaries.data or []
        scores = [float(r['total_score']) for r in records if r.get('total_score') is not None]

        # 1. Total Evaluated — count of users with scores
        total_evaluated = len(scores)

        # 2. Avg Score — weighted average using bell curve midpoints
        bell_curve_buckets = [
            (1.0, 1.5, 1.25),
            (1.5, 2.0, 1.75),
            (2.0, 2.5, 2.25),
            (2.5, 3.0, 2.75),
            (3.0, 3.5, 3.25),
            (3.5, 4.0, 3.75),
            (4.0, 4.5, 4.25),
            (4.5, 5.0, 4.75),
        ]

        weighted_sum = 0.0
        total_count = 0
        top_performers = 0

        for low, high, midpoint in bell_curve_buckets:
            if high == 5.0:
                bucket_scores = [s for s in scores if low <= s <= high]
            else:
                bucket_scores = [s for s in scores if low <= s < high]

            count = len(bucket_scores)
            weighted_sum += midpoint * count
            total_count += count

            # Top performers = count in highest bucket (4.5-5.0)
            if low == 4.5:
                top_performers = count

        avg_score = round(weighted_sum / total_count, 2) if total_count > 0 else 0.0

        # 3. Optional: employee_score for sub_dept_admin
        employee_score = None
        if employee_id:
            emp_summary = (
                supabase.table('performance_summaries')
                .select('total_score')
                .eq('user_id', employee_id)
                .eq('year', year)
                .eq('period', db_period)
                .limit(1)
                .execute()
            )
            if emp_summary.data and len(emp_summary.data) > 0:
                ts = emp_summary.data[0].get('total_score')
                employee_score = float(ts) if ts is not None else None

        return jsonify({
            'success': True,
            'data': {
                'total_evaluated': total_evaluated,
                'avg_score': avg_score,
                'top_performers': top_performers,
                'employee_score': employee_score
            }
        }), 200

    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[report-metrics] ERROR: {e}\n{error_detail}")
        return jsonify({'success': False, 'error': str(e), 'detail': error_detail}), 500


# ============================================================================
# COMPARISON LIVE (Dynamic — computed from performance_summaries for both periods)
# ============================================================================

@app.route('/api/comparison-live', methods=['GET'])
def get_comparison_live():
    """
    Get dynamic mid-year vs year-end comparison from performance_summaries.

    Query Parameters:
        - year: e.g. 2026
        - scope: 'country' | 'branch' | 'department' | 'sub_department'
        - scope_id: UUID of the scoped entity
    """
    try:
        year     = int(request.args.get('year', datetime.now().year))
        scope    = request.args.get('scope', 'country')
        scope_id = request.args.get('scope_id')

        if not scope_id:
            return jsonify({'success': False, 'error': 'scope_id is required'}), 400

        # Resolve employee IDs based on scope
        if scope == 'country':
            users = supabase.table('users').select('id').eq('country_id', scope_id).eq('role', 'employee').execute()
        elif scope == 'branch':
            users = supabase.table('users').select('id').eq('branch_id', scope_id).eq('role', 'employee').execute()
        elif scope == 'department':
            users = supabase.table('users').select('id').eq('department_id', scope_id).eq('role', 'employee').execute()
        elif scope == 'sub_department':
            users = supabase.table('users').select('id').eq('sub_department_id', scope_id).eq('role', 'employee').execute()
        else:
            return jsonify({'success': False, 'error': 'Invalid scope'}), 400

        emp_ids = [u['id'] for u in users.data]

        if not emp_ids:
            return jsonify({'success': True, 'data': []}), 200

        # Fetch scores for both periods
        h1_records = (
            supabase.table('performance_summaries')
            .select('total_score')
            .eq('year', year)
            .eq('period', 'H1')
            .in_('user_id', emp_ids)
            .execute()
        )
        h2_records = (
            supabase.table('performance_summaries')
            .select('total_score')
            .eq('year', year)
            .eq('period', 'H2')
            .in_('user_id', emp_ids)
            .execute()
        )

        h1_dist = calculate_bell_curve_from_scores(h1_records.data)
        h2_dist = calculate_bell_curve_from_scores(h2_records.data)

        h1_by_range = {d['rating_range']: d['employee_count'] for d in h1_dist}
        h2_by_range = {d['rating_range']: d['employee_count'] for d in h2_dist}

        rating_ranges = ['1.0-1.5', '1.5-2.0', '2.0-2.5', '2.5-3.0',
                         '3.0-3.5', '3.5-4.0', '4.0-4.5', '4.5-5.0']
        comparison = [
            {
                'rating_range': rr,
                'mid_year_count': h1_by_range.get(rr, 0),
                'year_end_count': h2_by_range.get(rr, 0),
                'comparison_year': year,
            }
            for rr in rating_ranges
        ]

        return jsonify({'success': True, 'data': comparison}), 200

    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[comparison-live] ERROR: {e}\n{error_detail}")
        return jsonify({'success': False, 'error': str(e), 'detail': error_detail}), 500


# ============================================================================
# PERFORMANCE RECORDS
# ============================================================================

@app.route('/api/performance-summaries/user/<user_id>', methods=['GET'])
def get_performance_summaries_by_user(user_id: str):
    try:
        year = request.args.get('year', datetime.now().year)
        query = (
            supabase.table('performance_summaries')
            .select('user_id, total_score, period, year')
            .eq('user_id', user_id)
            .eq('year', int(year))
            .execute()
        )
        # Map DB period values back to frontend values
        for record in query.data:
            if record.get('period') == 'H1':
                record['period'] = 'mid_year'
            elif record.get('period') == 'H2':
                record['period'] = 'year_end'
        return jsonify({'success': True, 'data': query.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    API health check endpoint
    """
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'PMS Dashboard & Reporting API'
    }), 200

# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# ============================================================================
# POTENTIAL ASSESSMENT API ENDPOINTS
# All routes are NEW — no existing routes are modified.
# ============================================================================

# ── Helpers ──────────────────────────────────────────────────────────────────

def _calculate_pillar_rating(ratings: list) -> str:
    """
    Majority rule:
      ≥ 2 H → H
      ≥ 2 L → L
      else  → M
    """
    h = ratings.count('H')
    l = ratings.count('L')
    if h >= 2:
        return 'H'
    if l >= 2:
        return 'L'
    return 'M'


def _calculate_talent_block(ability: str, aspiration: str, leadership: str) -> str:
    """
    All H → A Talent
    All L → C Talent
    Else  → B Talent
    """
    ratings = [ability, aspiration, leadership]
    if all(r == 'H' for r in ratings):
        return 'A'
    if all(r == 'L' for r in ratings):
        return 'C'
    return 'B'


def _log_assessment_action(assessment_id: str, actor_id: str, actor_role: str,
                            action: str, cycle: str):
    """Write to potential_assessment_audit_log — non-fatal."""
    try:
        supabase.table('potential_assessment_audit_log').insert({
            'assessment_id': assessment_id,
            'actor_id': actor_id,
            'actor_role': actor_role,
            'action': action,
            'cycle': cycle,
        }).execute()
    except Exception as e:
        print(f'[AUDIT LOG WARNING] Failed to write audit log: {e}')


def _strip_supervisor_columns(items: list, assessment_status: str, requester_id: str,
                               supervisor_id: str) -> list:
    """
    Remove supervisor_rating and supervisor_justification from items
    unless status=completed AND requester is NOT the appraisee (i.e. supervisor view allowed).
    Both parties see completed data, but appraisee must wait until completed.
    """
    if assessment_status == 'completed':
        return items  # both parties see everything on completion
    # Not completed — strip supervisor columns for everyone
    return [
        {k: v for k, v in item.items() if k not in ('supervisor_rating', 'supervisor_justification')}
        for item in items
    ]


# ── Route 1: Active Appraisal Cycle ──────────────────────────────────────────

@app.route('/api/appraisal-cycles/active', methods=['GET'])
def get_active_appraisal_cycle():
    """
    Returns the currently active appraisal cycle.
    Only one cycle can be active at a time (unique index enforces this in DB).
    """
    try:
        response = supabase.table('appraisal_cycles') \
            .select('*') \
            .eq('is_active', True) \
            .limit(1) \
            .execute()

        if not response.data:
            return jsonify({'success': False, 'error': 'No active appraisal cycle found'}), 404

        return jsonify({'success': True, 'data': response.data[0]}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Route 2: Get Assessment for Employee ─────────────────────────────────────

@app.route('/api/potential-assessment/<employee_id>/<cycle>', methods=['GET'])
def get_potential_assessment(employee_id: str, cycle: str):
    """
    Returns the full assessment record + all items for a given employee and cycle.
    If no record exists, returns { status: 'not_started' }.
    Supervisor columns are stripped unless status=completed.

    Query params:
        requester_id — UUID of the caller (used for column filtering)
    """
    try:
        requester_id = request.args.get('requester_id', '')

        # Fetch assessment record
        assessment_resp = supabase.table('potential_assessments') \
            .select('*') \
            .eq('employee_id', employee_id) \
            .eq('appraisal_cycle', cycle) \
            .limit(1) \
            .execute()

        if not assessment_resp.data:
            return jsonify({'success': True, 'data': {'status': 'not_started'}}), 200

        assessment = assessment_resp.data[0]

        # Fetch items
        items_resp = supabase.table('potential_assessment_items') \
            .select('*') \
            .eq('assessment_id', assessment['id']) \
            .execute()

        items = _strip_supervisor_columns(
            items_resp.data,
            assessment['status'],
            requester_id,
            assessment['supervisor_id']
        )

        return jsonify({
            'success': True,
            'data': {**assessment, 'items': items}
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Route 3: Subordinates List ────────────────────────────────────────────────

@app.route('/api/potential-assessment/subordinates/<supervisor_id>/<cycle>', methods=['GET'])
def get_subordinates_assessment_status(supervisor_id: str, cycle: str):
    """
    Returns all direct subordinates of the supervisor with their assessment
    status for the given cycle. Scope is resolved by supervisor role.

    Query params:
        supervisor_role — role of the calling supervisor
    """
    try:
        supervisor_role = request.args.get('supervisor_role', '')

        # Resolve subordinate users based on supervisor scope
        subordinates = []

        if supervisor_role == 'hq_admin':
            # HQ Admin → all country admins
            resp = supabase.table('users') \
                .select('id, full_name, email, emp_id, country_id, role') \
                .eq('role', 'country_admin') \
                .execute()
            raw = resp.data or []

            # Manual lookup: fetch country names for all unique country_ids
            country_ids = list({u['country_id'] for u in raw if u.get('country_id')})
            country_name_map = {}
            if country_ids:
                c_resp = supabase.table('countries') \
                    .select('id, name') \
                    .in_('id', country_ids) \
                    .execute()
                country_name_map = {c['id']: c['name'] for c in (c_resp.data or [])}

            subordinates = []
            for u in raw:
                u['country_name'] = country_name_map.get(u.get('country_id'), '—')
                subordinates.append(u)

        elif supervisor_role == 'country_admin':
            # Country Admin → branch admins in same country
            sup_resp = supabase.table('users').select('country_id').eq('id', supervisor_id).single().execute()
            if sup_resp.data and sup_resp.data.get('country_id'):
                resp = supabase.table('users') \
                    .select('id, full_name, email, emp_id, iata_branch_code, country_id, role') \
                    .eq('role', 'branch_admin') \
                    .eq('country_id', sup_resp.data['country_id']) \
                    .execute()
                subordinates = resp.data or []

        elif supervisor_role == 'branch_admin':
            # Branch Admin → dept admins in same branch (by iata_branch_code)
            sup_resp = supabase.table('users').select('iata_branch_code').eq('id', supervisor_id).single().execute()
            if sup_resp.data and sup_resp.data.get('iata_branch_code'):
                resp = supabase.table('users') \
                    .select('id, full_name, email, emp_id, iata_branch_code, department_id, role') \
                    .eq('role', 'dept_admin') \
                    .eq('iata_branch_code', sup_resp.data['iata_branch_code']) \
                    .execute()
                subordinates = resp.data or []

        elif supervisor_role == 'dept_admin':
            # Dept Admin → sub dept admins in same department
            sup_resp = supabase.table('users').select('department_id').eq('id', supervisor_id).single().execute()
            if sup_resp.data and sup_resp.data.get('department_id'):
                resp = supabase.table('users') \
                    .select('id, full_name, email, emp_id, department_id, sub_department_id, role') \
                    .eq('role', 'sub_dept_admin') \
                    .eq('department_id', sup_resp.data['department_id']) \
                    .execute()
                subordinates = resp.data or []

        elif supervisor_role == 'sub_dept_admin':
            # Sub Dept Admin → employees (role='employee') in same sub_department
            sup_resp = supabase.table('users').select('sub_department_id').eq('id', supervisor_id).single().execute()
            if sup_resp.data and sup_resp.data.get('sub_department_id'):
                resp = supabase.table('users') \
                    .select('id, full_name, email, emp_id, sub_department_id, designation, role') \
                    .eq('role', 'employee') \
                    .eq('sub_department_id', sup_resp.data['sub_department_id']) \
                    .execute()
                subordinates = resp.data or []

        if not subordinates:
            return jsonify({'success': True, 'data': []}), 200

        # Fetch existing assessments for these subordinates this cycle
        sub_ids = [s['id'] for s in subordinates]
        assessments_resp = supabase.table('potential_assessments') \
            .select('employee_id, status, talent_block, overall_ability, overall_aspiration, overall_leadership') \
            .in_('employee_id', sub_ids) \
            .eq('appraisal_cycle', cycle) \
            .execute()

        assessment_map = {a['employee_id']: a for a in (assessments_resp.data or [])}

        result = []
        for sub in subordinates:
            assessment = assessment_map.get(sub['id'])
            result.append({
                **sub,
                'assessment_status': assessment['status'] if assessment else 'not_started',
                'talent_block': assessment.get('talent_block') if assessment else None,
            })

        return jsonify({'success': True, 'data': result}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Route 4: Self-Submit ──────────────────────────────────────────────────────

@app.route('/api/potential-assessment/self-submit', methods=['POST'])
def self_submit_potential_assessment():
    """
    Appraisee submits their self-assessment.
    Creates the assessment record if none exists.
    Transitions status: pending_self → pending_supervisor.
    Self columns are locked after this call (enforced by status check).

    Request Body:
        {
            "employee_id": "uuid",
            "supervisor_id": "uuid",
            "appraisee_role": "country_admin | branch_admin | dept_admin | sub_dept_admin | employee",
            "cycle": "2024-25",
            "items": [
                {
                    "pillar": "ability | aspiration | leadership",
                    "component_number": 1,
                    "self_rating": "H | M | L",
                    "self_example": "text"
                },
                ...  (9 items total)
            ]
        }
    """
    try:
        data = request.json or {}
        required = ['employee_id', 'supervisor_id', 'appraisee_role', 'cycle', 'items']
        missing = [f for f in required if f not in data]
        if missing:
            return jsonify({'success': False, 'error': f'Missing fields: {missing}'}), 400

        if len(data['items']) != 9:
            return jsonify({'success': False, 'error': 'Exactly 9 items required (3 pillars × 3 components)'}), 400

        # Validate role
        valid_roles = ('country_admin', 'branch_admin', 'dept_admin', 'sub_dept_admin', 'employee')
        if data['appraisee_role'] not in valid_roles:
            return jsonify({'success': False, 'error': 'Invalid appraisee_role'}), 400

        employee_id = data['employee_id']
        cycle = data['cycle']

        # Check if record already exists
        existing = supabase.table('potential_assessments') \
            .select('id, status') \
            .eq('employee_id', employee_id) \
            .eq('appraisal_cycle', cycle) \
            .limit(1) \
            .execute()

        if existing.data:
            assessment = existing.data[0]
            if assessment['status'] != 'pending_self':
                return jsonify({
                    'success': False,
                    'error': 'Self-assessment has already been submitted and is locked.'
                }), 409
            assessment_id = assessment['id']
        else:
            # Create new assessment record
            new_assessment = supabase.table('potential_assessments').insert({
                'employee_id': data['employee_id'],
                'supervisor_id': data['supervisor_id'],
                'appraisee_role': data['appraisee_role'],
                'appraisal_cycle': cycle,
                'status': 'pending_self',
            }).execute()
            assessment_id = new_assessment.data[0]['id']

        # Upsert the 9 items (self columns only)
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()

        for item in data['items']:
            supabase.table('potential_assessment_items').upsert({
                'assessment_id': assessment_id,
                'pillar': item['pillar'],
                'component_number': item['component_number'],
                'self_rating': item.get('self_rating'),
                'self_example': item.get('self_example'),
            }, on_conflict='assessment_id,pillar,component_number').execute()

        # Transition status and record timestamp
        updated = supabase.table('potential_assessments').update({
            'status': 'pending_supervisor',
            'self_submitted_at': now_iso,
        }).eq('id', assessment_id).execute()

        # Audit log
        _log_assessment_action(
            assessment_id=assessment_id,
            actor_id=employee_id,
            actor_role=data['appraisee_role'],
            action='self_submit',
            cycle=cycle,
        )

        return jsonify({'success': True, 'data': updated.data[0]}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Route 5: Supervisor Submit ────────────────────────────────────────────────

@app.route('/api/potential-assessment/supervisor-submit', methods=['POST'])
def supervisor_submit_potential_assessment():
    """
    Supervisor submits ratings for an appraisee.
    Calculates overall pillar ratings + talent block.
    Transitions status: pending_supervisor → completed.

    Request Body:
        {
            "assessment_id": "uuid",
            "supervisor_id": "uuid",
            "supervisor_role": "hq_admin | country_admin | ...",
            "items": [
                {
                    "id": "uuid",   (existing item id)
                    "supervisor_rating": "H | M | L",
                    "supervisor_justification": "text"
                },
                ...  (9 items)
            ]
        }
    """
    try:
        data = request.json or {}
        required = ['assessment_id', 'supervisor_id', 'items']
        missing = [f for f in required if f not in data]
        if missing:
            return jsonify({'success': False, 'error': f'Missing fields: {missing}'}), 400

        assessment_id = data['assessment_id']

        # Verify assessment exists and is in pending_supervisor state
        assessment_resp = supabase.table('potential_assessments') \
            .select('*') \
            .eq('id', assessment_id) \
            .single() \
            .execute()

        if not assessment_resp.data:
            return jsonify({'success': False, 'error': 'Assessment not found'}), 404

        assessment = assessment_resp.data

        if assessment['status'] != 'pending_supervisor':
            return jsonify({
                'success': False,
                'error': f"Cannot submit: assessment status is '{assessment['status']}', expected 'pending_supervisor'."
            }), 409

        # Verify caller is the supervisor
        if assessment['supervisor_id'] != data['supervisor_id']:
            return jsonify({'success': False, 'error': 'Unauthorised: caller is not the assigned supervisor'}), 403

        # Update each item with supervisor ratings
        for item in data['items']:
            supabase.table('potential_assessment_items').update({
                'supervisor_rating': item.get('supervisor_rating'),
                'supervisor_justification': item.get('supervisor_justification'),
            }).eq('id', item['id']).execute()

        # Fetch all items to calculate pillar ratings
        all_items_resp = supabase.table('potential_assessment_items') \
            .select('pillar, supervisor_rating') \
            .eq('assessment_id', assessment_id) \
            .execute()

        all_items = all_items_resp.data or []

        # Group by pillar
        pillar_ratings: dict = {'ability': [], 'aspiration': [], 'leadership': []}
        for itm in all_items:
            pillar = itm.get('pillar')
            rating = itm.get('supervisor_rating')
            if pillar in pillar_ratings and rating:
                pillar_ratings[pillar].append(rating)

        overall_ability    = _calculate_pillar_rating(pillar_ratings['ability'])
        overall_aspiration = _calculate_pillar_rating(pillar_ratings['aspiration'])
        overall_leadership = _calculate_pillar_rating(pillar_ratings['leadership'])
        talent_block       = _calculate_talent_block(overall_ability, overall_aspiration, overall_leadership)

        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()

        # Update assessment to completed
        updated = supabase.table('potential_assessments').update({
            'status': 'completed',
            'supervisor_submitted_at': now_iso,
            'overall_ability': overall_ability,
            'overall_aspiration': overall_aspiration,
            'overall_leadership': overall_leadership,
            'talent_block': talent_block,
        }).eq('id', assessment_id).execute()

        # Audit log
        _log_assessment_action(
            assessment_id=assessment_id,
            actor_id=data['supervisor_id'],
            actor_role=data.get('supervisor_role', 'unknown'),
            action='supervisor_submit',
            cycle=assessment['appraisal_cycle'],
        )

        return jsonify({'success': True, 'data': updated.data[0]}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# APPLICATION ENTRY POINT
# ============================================================================

if __name__ == '__main__':
    # Run Flask development server
    # In production, use a WSGI server like Gunicorn
    app.run(debug=True, host='0.0.0.0', port=5000)