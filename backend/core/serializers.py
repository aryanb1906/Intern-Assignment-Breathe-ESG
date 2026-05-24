from rest_framework import serializers
from .models import (
    AnalystReview,
    AuditEvent,
    DataSource,
    Facility,
    ImportBatch,
    Membership,
    NormalizedEmissionRecord,
    Organization,
    RawRecord,
)


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = '__all__'


class MembershipSerializer(serializers.ModelSerializer):
    organization_slug = serializers.SlugRelatedField(source='organization', slug_field='slug', read_only=True)

    class Meta:
        model = Membership
        fields = '__all__'


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = '__all__'


class FacilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Facility
        fields = '__all__'


class ImportBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportBatch
        fields = '__all__'


class RawRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawRecord
        fields = '__all__'


class NormalizedEmissionRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = NormalizedEmissionRecord
        fields = '__all__'


class AnalystReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalystReview
        fields = '__all__'


class AuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = '__all__'


class OverviewSerializer(serializers.Serializer):
    organization = serializers.CharField()
    total_records = serializers.IntegerField()
    pending_review = serializers.IntegerField()
    suspicious_rows = serializers.IntegerField()
    approved_rows = serializers.IntegerField()
    failed_imports = serializers.IntegerField()


class SourceBreakdownSerializer(serializers.Serializer):
    source_type = serializers.CharField()
    source_name = serializers.CharField()
    total_records = serializers.IntegerField()
    pending_review = serializers.IntegerField()
    suspicious_rows = serializers.IntegerField()
    approved_rows = serializers.IntegerField()


class DashboardSerializer(serializers.Serializer):
    organization = serializers.CharField()
    summary = OverviewSerializer()
    source_breakdown = SourceBreakdownSerializer(many=True)
    recent_batches = ImportBatchSerializer(many=True)
    recent_records = NormalizedEmissionRecordSerializer(many=True)
    recent_audits = AuditEventSerializer(many=True)


class SessionSerializer(serializers.Serializer):
    organization = OrganizationSerializer()
    membership = MembershipSerializer()
    memberships = MembershipSerializer(many=True)
    permissions = serializers.DictField(child=serializers.BooleanField())
