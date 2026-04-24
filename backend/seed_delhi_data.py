"""
Seed Delhi Branch (IND-DL) data via Supabase API
Run: python seed_delhi_data.py
"""

from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

def main():
    # 1. Get Delhi branch
    branch_resp = supabase.table('branches').select('*').eq('code', 'IND-DL').limit(1).execute()
    if not branch_resp.data:
        print("❌ No branch with code 'IND-DL' found. Run seed_india_branches.sql first.")
        return
    branch = branch_resp.data[0]
    branch_id = branch['id']
    country_id = branch['country_id']
    print(f"✅ Found Delhi branch: {branch_id}")

    # 2. Get mid-year and year-end report IDs
    mid_resp = supabase.table('branch_performance_reports').select('id').eq('branch_id', branch_id).eq('report_type', 'mid_year').limit(1).execute()
    year_resp = supabase.table('branch_performance_reports').select('id').eq('branch_id', branch_id).eq('report_type', 'year_end').limit(1).execute()

    mid_report_id = mid_resp.data[0]['id'] if mid_resp.data else None
    year_report_id = year_resp.data[0]['id'] if year_resp.data else None
    print(f"✅ Mid-year report: {mid_report_id}")
    print(f"✅ Year-end report: {year_report_id}")

    if not mid_report_id:
        print("❌ No mid-year report found for Delhi. Run seed_india_branches.sql first.")
        return

    # 3. Seed mid-year bell curve (check if exists first)
    existing_bc = supabase.table('branch_bell_curve_data').select('id').eq('report_id', mid_report_id).limit(1).execute()
    if not existing_bc.data:
        bell_curve_data = [
            {'report_id': mid_report_id, 'rating_range': '1.0-1.5', 'employee_count': 8,  'percentage': 4.65},
            {'report_id': mid_report_id, 'rating_range': '1.5-2.0', 'employee_count': 14, 'percentage': 8.14},
            {'report_id': mid_report_id, 'rating_range': '2.0-2.5', 'employee_count': 30, 'percentage': 17.44},
            {'report_id': mid_report_id, 'rating_range': '2.5-3.0', 'employee_count': 50, 'percentage': 29.07},
            {'report_id': mid_report_id, 'rating_range': '3.0-3.5', 'employee_count': 42, 'percentage': 24.42},
            {'report_id': mid_report_id, 'rating_range': '3.5-4.0', 'employee_count': 18, 'percentage': 10.47},
            {'report_id': mid_report_id, 'rating_range': '4.0-4.5', 'employee_count': 10, 'percentage': 5.81},
        ]
        supabase.table('branch_bell_curve_data').insert(bell_curve_data).execute()
        print("✅ Inserted mid-year bell curve data (7 rows)")
    else:
        print("⏭️  Mid-year bell curve data already exists, skipping")

    # 4. Seed mid-year AI insights (check if exists first)
    existing_ins = supabase.table('branch_ai_insights').select('id').eq('report_id', mid_report_id).limit(1).execute()
    if not existing_ins.data:
        insights_data = [
            {
                'report_id': mid_report_id,
                'insight_text': 'Delhi branch mid-year distribution follows a normal curve with slight right skew. Top 16% performers exceed 3.5 rating. Recommend targeted development programs for the lower 13% in the 1.0–2.0 band.',
                'insight_type': 'distribution_analysis',
            },
            {
                'report_id': mid_report_id,
                'insight_text': 'Consider implementing peer mentoring programs between top performers and mid-tier employees to accelerate growth across the branch.',
                'insight_type': 'recommendation',
            },
        ]
        supabase.table('branch_ai_insights').insert(insights_data).execute()
        print("✅ Inserted mid-year AI insights (2 rows)")
    else:
        print("⏭️  Mid-year AI insights already exist, skipping")

    # 5. Seed comparison data (check if exists first)
    existing_comp = supabase.table('branch_performance_comparison').select('id').eq('branch_id', branch_id).eq('comparison_year', 2026).limit(1).execute()
    if not existing_comp.data:
        comparison_data = [
            {'branch_id': branch_id, 'country_id': country_id, 'rating_range': '1.0-1.5', 'mid_year_count': 8,  'year_end_count': 6,  'comparison_year': 2026},
            {'branch_id': branch_id, 'country_id': country_id, 'rating_range': '1.5-2.0', 'mid_year_count': 14, 'year_end_count': 12, 'comparison_year': 2026},
            {'branch_id': branch_id, 'country_id': country_id, 'rating_range': '2.0-2.5', 'mid_year_count': 30, 'year_end_count': 28, 'comparison_year': 2026},
            {'branch_id': branch_id, 'country_id': country_id, 'rating_range': '2.5-3.0', 'mid_year_count': 50, 'year_end_count': 50, 'comparison_year': 2026},
            {'branch_id': branch_id, 'country_id': country_id, 'rating_range': '3.0-3.5', 'mid_year_count': 42, 'year_end_count': 55, 'comparison_year': 2026},
            {'branch_id': branch_id, 'country_id': country_id, 'rating_range': '3.5-4.0', 'mid_year_count': 18, 'year_end_count': 20, 'comparison_year': 2026},
            {'branch_id': branch_id, 'country_id': country_id, 'rating_range': '4.0-4.5', 'mid_year_count': 10, 'year_end_count': 9,  'comparison_year': 2026},
        ]
        supabase.table('branch_performance_comparison').insert(comparison_data).execute()
        print("✅ Inserted comparison data (7 rows)")
    else:
        print("⏭️  Comparison data already exists, skipping")

    print("\n🎉 Delhi branch data seeding complete!")
    print("   You can now view reports at /branch-admin/reports/dept-001")

if __name__ == '__main__':
    main()
