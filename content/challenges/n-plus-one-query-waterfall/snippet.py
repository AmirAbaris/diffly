from sqlmodel import Session, select
from typing import Any


class OrganizationSerializer:
    def __init__(self, session: Session) -> None:
        self.session = session

    def serialize_organization_roster(self, org_id: int) -> list[dict[str, Any]]:
        """Fetch all organization members and format detailed public profiles."""
        # Query 1: Fetch membership records
        stmt = select(OrgMember).where(OrgMember.org_id == org_id)
        members = self.session.exec(stmt).all()

        roster: list[dict[str, Any]] = []

        # Defect: N+1 query waterfall inside loop executing queries per member
        for member in members:
            # Query N: Separate query per member for user profile
            profile_stmt = select(UserProfile).where(UserProfile.user_id == member.user_id)
            profile = self.session.exec(profile_stmt).first()

            # Query N: Separate query per member for assigned permissions
            role_stmt = select(OrgRole).where(OrgRole.id == member.role_id)
            role = self.session.exec(role_stmt).first()

            roster.append({
                "member_id": member.id,
                "user_id": member.user_id,
                "display_name": profile.display_name if profile else "Unknown",
                "avatar_url": profile.avatar_url if profile else None,
                "role_name": role.name if role else "Guest",
                "joined_at": member.joined_at.isoformat(),
            })

        return roster
