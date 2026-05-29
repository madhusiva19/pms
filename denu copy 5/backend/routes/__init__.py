"""Route registration for the performance evaluation API."""

from .approval_routes import approval_bp
from .enquiry_routes import enquiry_bp
from .evaluation_routes import evaluation_bp
from .evaluation_status_routes import evaluation_status_bp
from .notification_routes import notification_bp
from .performance_routes import performance_bp
from .system_routes import system_bp
from .team_member_routes import team_member_bp


def register_blueprints(app):
    """Register all controller-style Flask blueprints."""

    # Each blueprint maps one API area to its service module. This mirrors a
    # Spring Boot controller package while keeping Flask route wiring explicit.
    app.register_blueprint(system_bp)
    app.register_blueprint(team_member_bp)
    app.register_blueprint(approval_bp)
    app.register_blueprint(notification_bp)
    app.register_blueprint(enquiry_bp)
    app.register_blueprint(evaluation_status_bp)
    app.register_blueprint(performance_bp)
    app.register_blueprint(evaluation_bp)
