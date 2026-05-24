from rest_framework import decorators, response, viewsets, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.views import APIView
from django.db.models import Count, Q
from django.core.exceptions import PermissionDenied

from .auth import resolve_session, require_role
from .models import (
    AnalystReview,
    AuditEvent,
    DataSource,
    ImportBatch,
    Membership,
    NormalizedEmissionRecord,
    Organization,
    RawRecord,
)
from .serializers import (
    AnalystReviewSerializer,
    AuditEventSerializer,
    DataSourceSerializer,
    ImportBatchSerializer,
    DashboardSerializer,
    NormalizedEmissionRecordSerializer,
    OrganizationSerializer,
    SessionSerializer,
    RawRecordSerializer,
    OverviewSerializer,
    SourceBreakdownSerializer,
)
from .services import ingest_csv_batch, review_record


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all().order_by('name')
    serializer_class = OrganizationSerializer


class DataSourceViewSet(viewsets.ModelViewSet):
    queryset = DataSource.objects.select_related('organization').all().order_by('name')
    serializer_class = DataSourceSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_slug = self.request.query_params.get('organization')
        if organization_slug:
            queryset = queryset.filter(organization__slug=organization_slug)
        return queryset


class ImportBatchViewSet(viewsets.ModelViewSet):
    queryset = ImportBatch.objects.select_related('organization', 'data_source').all().order_by('-created_at')
    serializer_class = ImportBatchSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_slug = self.request.query_params.get('organization')
        if organization_slug:
            queryset = queryset.filter(organization__slug=organization_slug)
        return queryset

    @decorators.action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        session = resolve_session(request, request.data.get('organization_slug'))
        require_role(session, Membership.Role.ADMIN, Membership.Role.ANALYST)
        organization = session.organization
        data_source = DataSource.objects.get(id=request.data['data_source_id'], organization=organization)
        uploaded_file = request.FILES['file']
        label = request.data.get('label') or uploaded_file.name
        batch = ingest_csv_batch(
            organization=organization,
            data_source=data_source,
            uploaded_file=uploaded_file,
            label=label,
            imported_by_email=session.email,
        )
        return response.Response(ImportBatchSerializer(batch).data, status=status.HTTP_201_CREATED)


class RawRecordViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RawRecord.objects.select_related('organization', 'import_batch').all().order_by('-created_at')
    serializer_class = RawRecordSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_slug = self.request.query_params.get('organization')
        if organization_slug:
            queryset = queryset.filter(organization__slug=organization_slug)
        return queryset


class NormalizedRecordViewSet(viewsets.ModelViewSet):
    queryset = NormalizedEmissionRecord.objects.select_related('organization', 'data_source', 'import_batch', 'raw_record').all().order_by('-created_at')
    serializer_class = NormalizedEmissionRecordSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_slug = self.request.query_params.get('organization')
        batch_id = self.request.query_params.get('batch')
        source_type = self.request.query_params.get('source_type')
        status_filter = self.request.query_params.get('status')
        search = self.request.query_params.get('q')

        if organization_slug:
            queryset = queryset.filter(organization__slug=organization_slug)
        if batch_id:
            queryset = queryset.filter(import_batch_id=batch_id)
        if source_type:
            queryset = queryset.filter(data_source__source_type=source_type)
        if status_filter:
            queryset = queryset.filter(review_status=status_filter)
        if search:
            queryset = queryset.filter(
                Q(activity_type__icontains=search)
                | Q(source_record_key__icontains=search)
                | Q(source_system__icontains=search)
            )
        return queryset

    @decorators.action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        session = resolve_session(request, request.query_params.get('organization'))
        require_role(session, Membership.Role.ADMIN, Membership.Role.ANALYST)
        record = self.get_object()
        decision = request.data.get('decision', NormalizedEmissionRecord.ReviewStatus.APPROVED)
        comment = request.data.get('comment', '')
        edited_payload = request.data.get('normalized_payload')
        if isinstance(edited_payload, str):
            import json
            edited_payload = json.loads(edited_payload)
        review = review_record(record=record, decision=decision, reviewer_email=session.email, comment=comment, edited_payload=edited_payload)
        return response.Response(AnalystReviewSerializer(review).data)


class AnalystReviewViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AnalystReview.objects.select_related('record').all().order_by('-created_at')
    serializer_class = AnalystReviewSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_slug = self.request.query_params.get('organization')
        if organization_slug:
            queryset = queryset.filter(record__organization__slug=organization_slug)
        return queryset


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditEvent.objects.select_related('organization').all().order_by('-created_at')
    serializer_class = AuditEventSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_slug = self.request.query_params.get('organization')
        if organization_slug:
            queryset = queryset.filter(organization__slug=organization_slug)
        return queryset


class OverviewAPIView(APIView):
    def get(self, request):
        session = resolve_session(request, request.query_params.get('organization'))
        payload = build_dashboard_payload(session.organization.slug)
        return response.Response(OverviewSerializer(payload['summary']).data)


class DashboardAPIView(APIView):
    def get(self, request):
        session = resolve_session(request, request.query_params.get('organization'))
        payload = build_dashboard_payload(session.organization.slug)
        return response.Response(DashboardSerializer(payload).data)


class SessionAPIView(APIView):
    def get(self, request):
        session = resolve_session(request, request.query_params.get('organization'))
        memberships = list(
            session.organization.memberships.all().order_by('email')
        )
        permissions = {
            'can_upload': session.role in {Membership.Role.ADMIN},
            'can_review': session.role in {Membership.Role.ADMIN, Membership.Role.ANALYST},
            'can_seed': session.role in {Membership.Role.ADMIN},
        }
        payload = {
            'organization': session.organization,
            'membership': session.membership,
            'memberships': memberships,
            'permissions': permissions,
        }
        return response.Response(SessionSerializer(payload).data)


def build_dashboard_payload(organization_slug: str) -> dict:
    organization = Organization.objects.get(slug=organization_slug)
    records = NormalizedEmissionRecord.objects.filter(organization=organization)
    batches = ImportBatch.objects.filter(organization=organization).select_related('data_source').order_by('-created_at')
    audits = AuditEvent.objects.filter(organization=organization).order_by('-created_at')

    summary = {
        'organization': organization.slug,
        'total_records': records.count(),
        'pending_review': records.filter(review_status=NormalizedEmissionRecord.ReviewStatus.PENDING).count(),
        'suspicious_rows': records.filter(suspicious_score__gt=0).count(),
        'approved_rows': records.filter(review_status=NormalizedEmissionRecord.ReviewStatus.APPROVED).count(),
        'failed_imports': batches.filter(status=ImportBatch.Status.FAILED).count(),
    }

    source_breakdown = []
    for row in (
        records.values('data_source__source_type', 'data_source__name')
        .annotate(
            total_records=Count('id'),
            pending_review=Count('id', filter=Q(review_status=NormalizedEmissionRecord.ReviewStatus.PENDING)),
            suspicious_rows=Count('id', filter=Q(suspicious_score__gt=0)),
            approved_rows=Count('id', filter=Q(review_status=NormalizedEmissionRecord.ReviewStatus.APPROVED)),
        )
        .order_by('data_source__source_type')
    ):
        source_breakdown.append(
            {
                'source_type': row['data_source__source_type'],
                'source_name': row['data_source__name'],
                'total_records': row['total_records'],
                'pending_review': row['pending_review'],
                'suspicious_rows': row['suspicious_rows'],
                'approved_rows': row['approved_rows'],
            }
        )

    recent_records = records.select_related('data_source', 'import_batch').order_by('-created_at')[:10]
    recent_batches = batches[:6]
    recent_audits = audits[:10]

    return {
        'organization': organization.slug,
        'summary': summary,
        'source_breakdown': source_breakdown,
        'recent_batches': recent_batches,
        'recent_records': recent_records,
        'recent_audits': recent_audits,
    }


class DemoSeedAPIView(APIView):
    def post(self, request):
        session = resolve_session(request, request.data.get('organization_slug') or request.query_params.get('organization') or 'breathe-demo')
        require_role(session, Membership.Role.ADMIN)
        from django.core.management import call_command
        call_command('seed_demo')
        return response.Response({'status': 'seeded'})
