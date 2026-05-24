from dataclasses import dataclass

from django.core.exceptions import PermissionDenied

from .models import Membership, Organization


@dataclass(frozen=True)
class SessionContext:
    organization: Organization
    membership: Membership

    @property
    def email(self) -> str:
        return self.membership.email

    @property
    def role(self) -> str:
        return self.membership.role


def resolve_session(request, organization_slug: str | None = None) -> SessionContext:
    email = (request.headers.get('X-Breathe-Email') or request.query_params.get('email') or request.data.get('email') or 'analyst@breathe.local').strip()
    if not email:
        raise PermissionDenied('Missing X-Breathe-Email header or email parameter.')

    slug = (
        organization_slug
        or request.headers.get('X-Breathe-Organization')
        or request.query_params.get('organization')
        or request.data.get('organization_slug')
    )
    if not slug:
        raise PermissionDenied('Missing organization context.')

    organization = Organization.objects.filter(slug=slug).first()
    if organization is None:
        raise PermissionDenied(f'Unknown organization: {slug}')

    membership = Membership.objects.filter(organization=organization, email__iexact=email).select_related('organization').first()
    if membership is None:
        raise PermissionDenied(f'{email} is not a member of {organization.slug}')

    return SessionContext(organization=organization, membership=membership)


def require_role(session: SessionContext, *allowed_roles: str) -> None:
    if session.role not in allowed_roles:
        raise PermissionDenied(f'{session.email} does not have access for this action.')