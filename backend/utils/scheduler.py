from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from models import supabase


def send_cutoff_notification(recipient_org_level: int, title: str, message: str):
    try:
        users = supabase.table("users")\
            .select("id")\
            .eq("org_level", recipient_org_level)\
            .eq("is_active", True)\
            .execute()

        for user in users.data:
            supabase.table("notifications").insert({
                "receiver_id":  user["id"],
                "type":         "objective_cutoff",
                "title":        title,
                "message":      message,
                "triggered_by": "system",
                "action_link":  None,
            }).execute()

    except Exception as e:
        print(f"❌ Failed to send cutoff notification: {str(e)}")


def send_all_users_notification(title: str, message: str):
    try:
        users = supabase.table("users")\
            .select("id")\
            .eq("is_active", True)\
            .execute()

        for user in users.data:
            supabase.table("notifications").insert({
                "receiver_id":  user["id"],
                "type":         "objective_cutoff",
                "title":        title,
                "message":      message,
                "triggered_by": "system",
                "action_link":  None,
            }).execute()

    except Exception as e:
        print(f"❌ Failed to send all users notification: {str(e)}")


def job_july_1():
    send_all_users_notification(
        title="New Appraisal Year Started",
        message="New appraisal year has started. Objective setting window is now open."
    )

def job_july_31():
    send_cutoff_notification(5,
        title="Objectives Setting Reminder",
        message="Reminder: Objectives must be set for your team by 31st August. Please begin KPI assignment now."
    )

def job_aug_5():
    send_cutoff_notification(4,
        title="Objectives Setting Alert",
        message="Alert: Objective setting is in progress. Verify that your Sub Dept Admins have begun KPI assignments."
    )

def job_aug_10():
    send_cutoff_notification(3,
        title="Objectives Setting Escalation",
        message="Escalation: Objective setting deadline approaching. Confirm Dept Admins are progressing with KPI assignments."
    )

def job_aug_15():
    send_cutoff_notification(2,
        title="Objectives Setting Escalation",
        message="Escalation: Objective setting nearing final deadline. Ensure all branches have completed KPI assignments."
    )

def job_aug_25():
    send_cutoff_notification(1,
        title="Final Escalation — Objectives Setting",
        message="Final Escalation: Objective setting closes 31st August. Incomplete assignments frozen with previous year KPIs. Grace period until 15th September."
    )

def job_aug_31():
    send_all_users_notification(
        title="Objectives Setting Window Closed",
        message="Objective setting window is now CLOSED. Incomplete objectives frozen with previous year KPIs."
    )

def job_sep_15():
    send_cutoff_notification(1,
        title="Grace Period Ended",
        message="Grace period has ended. PMS templates are now fully frozen. No further changes permitted until next appraisal cycle."
    )


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(job_july_1,  CronTrigger(month=7, day=1,  hour=8, minute=0))
    scheduler.add_job(job_july_31, CronTrigger(month=7, day=31, hour=8, minute=0))
    scheduler.add_job(job_aug_5,   CronTrigger(month=8, day=5,  hour=8, minute=0))
    scheduler.add_job(job_aug_10,  CronTrigger(month=8, day=10, hour=8, minute=0))
    scheduler.add_job(job_aug_15,  CronTrigger(month=8, day=15, hour=8, minute=0))
    scheduler.add_job(job_aug_25,  CronTrigger(month=8, day=25, hour=8, minute=0))
    scheduler.add_job(job_aug_31,  CronTrigger(month=8, day=31, hour=8, minute=0))
    scheduler.add_job(job_sep_15,  CronTrigger(month=9, day=15, hour=8, minute=0))
    scheduler.start()
    print("✅ Objective cutoff scheduler started")
