from django.contrib import admin
from .models import (
    AnalystReview,
    AuditEvent,
    DataSource,
    EmissionFactorReference,
    Facility,
    ImportBatch,
    Membership,
    NormalizedEmissionRecord,
    Organization,
    RawRecord,
    UnitConversion,
)

admin.site.register([
    Organization,
    Membership,
    DataSource,
    Facility,
    ImportBatch,
    RawRecord,
    NormalizedEmissionRecord,
    AnalystReview,
    AuditEvent,
    UnitConversion,
    EmissionFactorReference,
])
