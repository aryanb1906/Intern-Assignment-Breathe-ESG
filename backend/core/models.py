import uuid
from django.db import models


class TimeStampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Organization(TimeStampedModel):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    default_currency = models.CharField(max_length=8, default='USD')

    def __str__(self):
        return self.name


class Membership(TimeStampedModel):
    class Role(models.TextChoices):
        VIEWER = 'viewer', 'Viewer'
        ANALYST = 'analyst', 'Analyst'
        ADMIN = 'admin', 'Admin'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='memberships')
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.ANALYST)

    class Meta:
        unique_together = [('organization', 'email')]


class DataSource(TimeStampedModel):
    class SourceType(models.TextChoices):
        SAP = 'sap', 'SAP'
        UTILITY = 'utility', 'Utility'
        TRAVEL = 'travel', 'Travel'

    class IngestionMode(models.TextChoices):
        CSV = 'csv_upload', 'CSV Upload'
        API = 'api_pull', 'API Pull'
        MANUAL = 'manual', 'Manual Paste'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='data_sources')
    source_type = models.CharField(max_length=20, choices=SourceType.choices)
    name = models.CharField(max_length=200)
    ingestion_mode = models.CharField(max_length=20, choices=IngestionMode.choices, default=IngestionMode.CSV)
    system_of_record = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)


class Facility(TimeStampedModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='facilities')
    external_code = models.CharField(max_length=80)
    name = models.CharField(max_length=200)
    plant_code = models.CharField(max_length=80, blank=True)
    meter_id = models.CharField(max_length=80, blank=True)
    country = models.CharField(max_length=80, blank=True)

    class Meta:
        unique_together = [('organization', 'external_code')]


class ImportBatch(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PROCESSED = 'processed', 'Processed'
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='import_batches')
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='import_batches')
    label = models.CharField(max_length=200)
    source_filename = models.CharField(max_length=255, blank=True)
    source_format = models.CharField(max_length=80, default='csv')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    total_rows = models.PositiveIntegerField(default=0)
    successful_rows = models.PositiveIntegerField(default=0)
    failed_rows = models.PositiveIntegerField(default=0)
    imported_by_email = models.EmailField(blank=True)
    source_created_at = models.DateTimeField(null=True, blank=True)
    error_summary = models.TextField(blank=True)


class RawRecord(TimeStampedModel):
    class Status(models.TextChoices):
        INGESTED = 'ingested', 'Ingested'
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='raw_records')
    import_batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name='raw_records')
    row_number = models.PositiveIntegerField()
    source_record_key = models.CharField(max_length=120, blank=True)
    row_hash = models.CharField(max_length=128)
    payload = models.JSONField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INGESTED)
    failure_reason = models.TextField(blank=True)

    class Meta:
        unique_together = [('import_batch', 'row_number')]


class UnitConversion(TimeStampedModel):
    from_unit = models.CharField(max_length=40)
    to_unit = models.CharField(max_length=40)
    factor = models.DecimalField(max_digits=18, decimal_places=6)
    domain = models.CharField(max_length=80, blank=True)


class EmissionFactorReference(TimeStampedModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='emission_factors', null=True, blank=True)
    activity_type = models.CharField(max_length=80)
    unit = models.CharField(max_length=40)
    factor_value = models.DecimalField(max_digits=18, decimal_places=6)
    factor_unit = models.CharField(max_length=40, default='kgCO2e')
    scope_category = models.CharField(max_length=4, choices=[('1', 'Scope 1'), ('2', 'Scope 2'), ('3', 'Scope 3')])
    source_system = models.CharField(max_length=80, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)


class NormalizedEmissionRecord(TimeStampedModel):
    class ReviewStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        EDITED = 'edited', 'Edited'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='normalized_records')
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='normalized_records')
    import_batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name='normalized_records')
    raw_record = models.OneToOneField(RawRecord, on_delete=models.SET_NULL, null=True, blank=True, related_name='normalized_record')
    facility = models.ForeignKey(Facility, on_delete=models.SET_NULL, null=True, blank=True)
    source_system = models.CharField(max_length=80)
    source_record_key = models.CharField(max_length=120, blank=True)
    activity_type = models.CharField(max_length=80)
    scope_category = models.CharField(max_length=4, choices=[('1', 'Scope 1'), ('2', 'Scope 2'), ('3', 'Scope 3')])
    original_quantity = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    original_unit = models.CharField(max_length=40, blank=True)
    normalized_quantity = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    normalized_unit = models.CharField(max_length=40, blank=True)
    emission_factor = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    emissions_kg_co2e = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    currency = models.CharField(max_length=10, blank=True)
    transaction_date = models.DateField(null=True, blank=True)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    raw_payload = models.JSONField(default=dict)
    normalized_payload = models.JSONField(default=dict)
    suspicious_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    suspicious_flags = models.JSONField(default=list)
    review_status = models.CharField(max_length=20, choices=ReviewStatus.choices, default=ReviewStatus.PENDING)
    review_note = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    edited_by_email = models.EmailField(blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)


class AnalystReview(TimeStampedModel):
    record = models.ForeignKey(NormalizedEmissionRecord, on_delete=models.CASCADE, related_name='reviews')
    reviewer_email = models.EmailField()
    decision = models.CharField(max_length=20, choices=NormalizedEmissionRecord.ReviewStatus.choices)
    comment = models.TextField(blank=True)
    before_payload = models.JSONField(default=dict)
    after_payload = models.JSONField(default=dict)


class AuditEvent(TimeStampedModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='audit_events')
    entity_type = models.CharField(max_length=80)
    entity_id = models.CharField(max_length=80)
    action = models.CharField(max_length=80)
    actor_email = models.EmailField(blank=True)
    before_state = models.JSONField(default=dict)
    after_state = models.JSONField(default=dict)
