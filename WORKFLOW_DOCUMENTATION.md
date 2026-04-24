# PMS Workflow Management System - Documentation

## Overview

The enhanced Workflow Management System implements a complete multi-level evaluation approval process with rejection handling, status tracking, and smart notifications. This system transforms the basic evaluation submission into a sophisticated workflow aligned with real-world HR practices.

## Architecture

### Backend Components (Flask)

#### 1. **Workflow Data Model**
```python
{
  "workflowId": "uuid",
  "memberId": "1",
  "memberName": "L.E Senevirathna",
  "submittedAt": "2024-04-24T10:30:00",
  "currentStatus": "pending_level1",
  "approvalChain": [...],
  "evaluationData": {...},
  "rejectionHistory": [...],
  "deadlineDate": "2024-05-01"
}
```

#### 2. **Approval Statuses**
- `draft` - Evaluation not yet submitted
- `submitted` - Initial submission
- `pending_level1` - Awaiting L1 Manager approval
- `pending_level2` - Awaiting L2 Senior Manager approval
- `pending_level3` - Awaiting L3 Director approval
- `approved` - Approved at all levels
- `rejected` - Rejected at current level
- `resubmitted` - Resubmitted after rejection

#### 3. **Approval Chain**
Each evaluation has a 3-level approval hierarchy:
- **Level 1**: Direct Manager
- **Level 2**: Senior Manager/Department Head
- **Level 3**: Director/Executive

### Frontend Components

#### 1. **Workflow Dashboard** (`/workflow`)
Central hub for all workflow management features
- Statistics overview (pending, approved, rejected)
- Quick access to all workflow features
- Visual process flow diagram
- Feature highlights

#### 2. **Approval Management** (`/workflow/approvals`)
For approvers to manage pending evaluations
- List of pending approvals
- Evaluation details review
- Approval chain visualization
- Approve/Reject decision making
- Comments for feedback

#### 3. **Status Tracker** (`/workflow/status-tracker`)
For anyone to track evaluation progress
- Real-time status view
- Complete approval chain history
- Rejection details and comments
- Category breakdown
- Deadline tracking

#### 4. **Notification Center**
Real-time alerts for workflow events
- Approval pending notifications
- Rejection alerts
- Approval confirmations
- Deadline warnings
- Unread count badge

## API Endpoints

### Workflow Submission
```
POST /api/evaluation/submit
Body: {
  "memberId": "1",
  "memberName": "L.E Senevirathna",
  "categories": [...]
}
Response: {
  "success": true,
  "workflowId": "uuid",
  "currentStatus": "submitted",
  "nextApprover": {...}
}
```

### Get Workflow Status
```
GET /api/workflow/{workflowId}
Response: {Complete workflow object with all details}
```

### Approve Evaluation
```
POST /api/workflow/{workflowId}/approve
Body: {
  "approverId": "101",
  "comments": "Looks good"
}
Response: {
  "success": true,
  "nextApprover": {...},
  "currentStatus": "pending_level2"
}
```

### Reject Evaluation
```
POST /api/workflow/{workflowId}/reject
Body: {
  "approverId": "101",
  "rejectionReason": "Please update metrics",
  "comments": "Detailed feedback..."
}
Response: {
  "success": true,
  "currentStatus": "rejected"
}
```

### Resubmit Evaluation
```
POST /api/workflow/{workflowId}/resubmit
Body: {
  "evaluationData": {...updated data...}
}
Response: {
  "success": true,
  "currentStatus": "pending_level1"
}
```

### Get Pending Approvals
```
GET /api/approvals/pending?approverId=101
Response: {
  "pendingCount": 5,
  "approvals": [{...}, {...}]
}
```

### Get Status Tracking
```
GET /api/evaluations/status-tracking
Response: [Array of all workflows with current status]
```

### Notifications
```
GET /api/notifications?userId=101
Response: {
  "notifications": [...],
  "unreadCount": 3
}

POST /api/notifications/{notificationId}/read
Response: {"success": true}
```

## Workflow Features

### 1. **Multi-Level Approval Process**
- Three hierarchical approval levels
- Each level must approve before moving to next
- Automatic notification to next approver
- Clear visibility of who has approved

### 2. **Rejection & Re-submission**
- Approvers can reject with detailed reasons
- Comments provided at each rejection
- Employees can edit and resubmit
- Rejection history tracked completely
- Auto-reset to Level 1 on resubmission

### 3. **Status Tracking**
- Real-time status for each evaluation
- Visual timeline of approvals
- Rejection history with reasons
- Days until deadline display
- Progress visualization

### 4. **Smart Notifications**
- Automatic alerts for pending approvals
- Rejection notifications with reason
- Approval confirmations
- Deadline warnings
- In-app notification center with unread badge

### 5. **Deadline Management**
- 7-day default evaluation period
- Visual deadline indicators
- Urgent (≤2 days) highlighting
- Deadline in all notifications

## Usage Flow

### For Employees
1. Go to `Evaluate Member` page
2. Fill in evaluation details
3. Click "Submit Evaluation"
4. Evaluation enters Level 1 approval
5. Monitor status in Status Tracker
6. If rejected, view feedback and resubmit
7. Get notification when fully approved

### For Managers (L1 Approver)
1. Open Approvals page (`/workflow/approvals`)
2. Review pending evaluations list
3. Select evaluation to review
4. View approval chain and evaluation details
5. Add comments if needed
6. Click "Approve" to move to next level
7. Or click "Reject & Send Back" with reason

### For Senior Managers (L2 Approver)
1. Same as L1, but reviewing Level 2 pending items
2. Can see Level 1 approval comments
3. Approve or reject based on review

### For Directors (L3 Approver)
1. Final approval level
2. Once approved, evaluation is complete
3. Employee receives completion notification

## Database Schema (Mock Data)

### Team Members
```python
{
  "id": "1",
  "name": "L.E Senevirathna",
  "role": "Senior Software Engineer",
  "department": "Engineering",
  "hierarchyLevel": 3,
  "managerId": "101"
}
```

### Approvers
```python
{
  "101": {
    "id": "101",
    "name": "Sarah Manager",
    "role": "Team Manager",
    "level": 1,
    "email": "sarah@company.com"
  }
}
```

## Key Features Implemented

✅ **Multi-level Approval Chain**
- 3-level hierarchical approval system
- Automatic progression through levels
- Level-specific visibility

✅ **Rejection & Re-submission**
- Detailed rejection reasons
- Comments at each level
- Complete rejection history
- Re-submission workflow
- Auto-reset approval chain

✅ **Status Tracking**
- Real-time status display
- Visual approval timeline
- Rejection details
- Progress indicators
- Deadline tracking

✅ **Notifications**
- Approval pending alerts
- Rejection notifications
- Approval confirmations
- Deadline warnings
- Unread count badge
- Auto-refresh every 10 seconds

✅ **Audit Trail**
- Complete workflow history
- All approval decisions
- Rejection reasons & comments
- Timestamp tracking
- User information

✅ **Deadline Management**
- 7-day evaluation period
- Visual deadline indicators
- Urgent status highlighting
- Notification reminders

## Configuration

### Approver Hierarchy
Edit in `backend/app.py`:
```python
APPROVERS = {
    "101": {"id": "101", "name": "Sarah Manager", "level": 1},
    "102": {"id": "102", "name": "Mike Senior Manager", "level": 2},
    "100": {"id": "100", "name": "John Director", "level": 3},
}
```

### Deadline Duration
Edit in `backend/app.py`:
```python
"deadlineDate": (datetime.now() + timedelta(days=7)).isoformat()
```

### Notification Refresh Interval
Edit in `frontend/app/workflow/components/NotificationCenter.tsx`:
```javascript
const interval = setInterval(fetchNotifications, 10000); // 10 seconds
```

## Future Enhancements

1. **Database Integration**
   - Replace mock data with real database
   - Persistent workflow storage
   - Query optimization

2. **Advanced Features**
   - Conditional approval chains based on role/level
   - Auto-escalation for overdue evaluations
   - Bulk approval actions
   - PDF export of evaluations

3. **Analytics**
   - Approval time metrics
   - Rejection rate analysis
   - Workflow performance dashboard
   - Department/team comparisons

4. **Email Integration**
   - Email notifications for approvals/rejections
   - Email reminders for pending approvals
   - Evaluation reports via email

5. **Customization**
   - Custom approval chains per department
   - Configurable evaluation periods
   - Custom evaluation templates

## Testing

### Test Scenarios

1. **Submit Evaluation**
   - Submit from evaluate-member page
   - Verify workflow created
   - Check approval chain initialized

2. **Approve at Level 1**
   - Go to approvals page
   - Select pending evaluation
   - Click Approve
   - Verify moves to Level 2 pending

3. **Reject and Resubmit**
   - Click Reject with reason
   - Enter comments
   - Go back to evaluate page
   - Resubmit with updates
   - Verify resets to Level 1

4. **Status Tracking**
   - Submit evaluation
   - Go to status tracker
   - Verify timeline shows pending L1
   - Check deadline display

5. **Notifications**
   - Open notification center
   - Verify pending notifications
   - Mark as read
   - Check unread count updates

## Support

For issues or questions about the workflow system:
1. Check the API endpoints in `backend/app.py`
2. Review frontend components in `frontend/app/workflow/`
3. Check browser console for JavaScript errors
4. Verify backend is running on port 5001

## Environment Setup

### Backend
```bash
cd backend
source venv/bin/activate
python app.py
```

### Frontend
```bash
cd frontend
npm run dev
```

Access at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5001
- Workflow Dashboard: http://localhost:3000/workflow
- Approvals: http://localhost:3000/workflow/approvals
- Status Tracker: http://localhost:3000/workflow/status-tracker
