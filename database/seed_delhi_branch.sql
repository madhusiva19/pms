-- Seed Delhi Branch (IND-DL) Missing Data
-- Adds: Mid-Year bell curve, mid-year AI insights, comparison data
-- Existing: branches row, mid-year & year-end reports, year-end bell curve, year-end insights

-- 1. Delhi Mid-Year Bell Curve Data
INSERT INTO branch_bell_curve_data (report_id, rating_range, employee_count, percentage, created_at) VALUES
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), '1.0-1.5', 8, 4.65, NOW()),
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), '1.5-2.0', 14, 8.14, NOW()),
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), '2.0-2.5', 30, 17.44, NOW()),
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), '2.5-3.0', 50, 29.07, NOW()),
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), '3.0-3.5', 42, 24.42, NOW()),
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), '3.5-4.0', 18, 10.47, NOW()),
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), '4.0-4.5', 10, 5.81, NOW());

-- 2. Delhi Mid-Year AI Insights
INSERT INTO branch_ai_insights (report_id, insight_text, insight_type, created_at) VALUES
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), 'Delhi branch mid-year distribution follows a normal curve with slight right skew. Top 16% performers exceed 3.5 rating. Recommend targeted development programs for the lower 13% in the 1.0–2.0 band.', 'distribution_analysis', NOW()),
((SELECT id FROM branch_performance_reports WHERE report_type = 'mid_year' AND branch_id = (SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1) LIMIT 1), 'Consider implementing peer mentoring programs between top performers and mid-tier employees to accelerate growth across the branch.', 'recommendation', NOW());

-- 3. Delhi Performance Comparison Data
INSERT INTO branch_performance_comparison (branch_id, country_id, rating_range, mid_year_count, year_end_count, comparison_year, created_at) VALUES
((SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1), '550e8400-e29b-41d4-a716-446655440001', '1.0-1.5', 8, 6, 2026, NOW()),
((SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1), '550e8400-e29b-41d4-a716-446655440001', '1.5-2.0', 14, 12, 2026, NOW()),
((SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1), '550e8400-e29b-41d4-a716-446655440001', '2.0-2.5', 30, 28, 2026, NOW()),
((SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1), '550e8400-e29b-41d4-a716-446655440001', '2.5-3.0', 50, 50, 2026, NOW()),
((SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1), '550e8400-e29b-41d4-a716-446655440001', '3.0-3.5', 42, 55, 2026, NOW()),
((SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1), '550e8400-e29b-41d4-a716-446655440001', '3.5-4.0', 18, 20, 2026, NOW()),
((SELECT id FROM branches WHERE code = 'IND-DL' LIMIT 1), '550e8400-e29b-41d4-a716-446655440001', '4.0-4.5', 10, 9, 2026, NOW());
