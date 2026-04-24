"""Populate ai_insights for country-level performance reports."""
import sys
sys.path.insert(0, '.')
from app import supabase, generate_ai_insight

# Get all performance reports
reports = supabase.table('performance_reports').select('id, report_type').execute()
print("Reports found:", len(reports.data))
for r in reports.data:
    report_id = r['id']
    report_type = r['report_type']
    print("  Report:", report_id, report_type)
    
    # Check if insight already exists for this report
    existing = supabase.table('ai_insights').select('id').eq('report_id', report_id).execute()
    if existing.data:
        print("    -> Already has insight, skipping")
        continue
    
    insight_text = generate_ai_insight({'top_performers_percentage': 18}, report_type)
    try:
        supabase.table('ai_insights').insert({
            'report_id': report_id,
            'insight_text': insight_text,
            'insight_type': 'distribution_analysis'
        }).execute()
        print("    -> Inserted insight OK")
    except Exception as e:
        print("    -> ERROR:", e)

# Final count
final = supabase.table('ai_insights').select('id').execute()
print("\nTotal ai_insights now:", len(final.data))
