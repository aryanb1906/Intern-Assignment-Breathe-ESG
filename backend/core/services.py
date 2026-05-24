from __future__ import annotations

import csv
import hashlib
import io
import math
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from .models import (
    AnalystReview,
    AuditEvent,
    DataSource,
    EmissionFactorReference,
    ImportBatch,
    NormalizedEmissionRecord,
    Organization,
    RawRecord,
)

DEFAULT_FACTORS = {
    'sap_diesel_liter': Decimal('2.68'),
    'sap_gasoline_liter': Decimal('2.31'),
    'utility_kwh': Decimal('0.42'),
    'flight_km': Decimal('0.15'),
    'hotel_night': Decimal('12.50'),
    'ground_km': Decimal('0.09'),
    'procurement_spend_usd': Decimal('0.18'),
}

AIRPORT_COORDS = {
    'DEL': (28.5562, 77.1000),
    'BOM': (19.0896, 72.8656),
    'BLR': (13.1986, 77.7066),
    'SIN': (1.3644, 103.9915),
    'DXB': (25.2532, 55.3657),
    'LHR': (51.4700, -0.4543),
    'JFK': (40.6413, -73.7781),
}


def _decimal(value: Any) -> Decimal | None:
    if value in (None, ''):
        return None
    return Decimal(str(value))


def _parse_date(value: str | None) -> datetime.date | None:
    if not value:
        return None
    value = value.strip()
    for fmt in ('%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _hash_row(payload: dict[str, Any]) -> str:
    canonical = repr(sorted(payload.items())).encode('utf-8')
    return hashlib.sha256(canonical).hexdigest()


def _haversine_km(origin: str, destination: str) -> Decimal | None:
    if origin not in AIRPORT_COORDS or destination not in AIRPORT_COORDS:
        return None
    lat1, lon1 = AIRPORT_COORDS[origin]
    lat2, lon2 = AIRPORT_COORDS[destination]
    radius = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return Decimal(str(radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))))


def _flags(*items: str) -> list[str]:
    return [item for item in items if item]


def _factor_for(activity_type: str, unit: str) -> Decimal:
    key = f'{activity_type}_{unit}'.lower().replace(' ', '_')
    return DEFAULT_FACTORS.get(key, Decimal('0'))


def normalize_row(source_type: str, row: dict[str, str]) -> dict[str, Any]:
    flags = []
    suspicious_score = Decimal('0')
    original_unit = ''
    original_quantity = None
    normalized_quantity = None
    normalized_unit = ''
    emissions = None
    activity_type = source_type
    scope = '3'
    source_record_key = row.get('record_id') or row.get('invoice_id') or row.get('trip_id') or row.get('belnr') or ''
    transaction_date = _parse_date(row.get('date') or row.get('transaction_date') or row.get('buchungsdatum') or row.get('billing_start'))
    period_start = _parse_date(row.get('billing_start') or row.get('period_start'))
    period_end = _parse_date(row.get('billing_end') or row.get('period_end'))

    if source_type == 'sap':
        activity_type = row.get('material_type', 'procurement')
        fuel_type = (row.get('fuel_type') or row.get('kraftstofftyp') or '').lower()
        original_quantity = _decimal(row.get('quantity') or row.get('menge'))
        original_unit = (row.get('unit') or row.get('einheit') or '').lower()
        is_fuel = bool(fuel_type) or 'fuel' in (row.get('materialdescription') or row.get('materialbeschreibung') or '').lower()
        if is_fuel:
            normalized_unit = 'liters'
            if original_unit in ('gal', 'gallon', 'gallons'):
                normalized_quantity = original_quantity * Decimal('3.78541') if original_quantity is not None else None
            elif original_unit in ('l', 'liter', 'liters'):
                normalized_quantity = original_quantity
            else:
                flags.append('missing_or_unexpected_unit')
                normalized_quantity = original_quantity
            factor = DEFAULT_FACTORS['sap_diesel_liter' if 'diesel' in fuel_type else 'sap_gasoline_liter']
            emissions = (normalized_quantity or Decimal('0')) * factor if normalized_quantity is not None else None
            scope = '1'
            if original_quantity is not None and original_quantity < 0:
                flags.append('negative_usage')
                suspicious_score += Decimal('40')
            if original_quantity is not None and original_quantity > 50000:
                flags.append('high_fuel_volume')
                suspicious_score += Decimal('25')
        else:
            normalized_unit = 'usd'
            normalized_quantity = original_quantity
            scope = '3'
            factor = DEFAULT_FACTORS['procurement_spend_usd']
            emissions = (normalized_quantity or Decimal('0')) * factor if normalized_quantity is not None else None
            if not original_unit:
                flags.append('missing_unit')
                suspicious_score += Decimal('10')
    elif source_type == 'utility':
        activity_type = 'electricity'
        original_quantity = _decimal(row.get('kwh') or row.get('consumption'))
        original_unit = (row.get('unit') or 'kWh').lower()
        normalized_unit = 'kwh'
        normalized_quantity = original_quantity
        emissions = (normalized_quantity or Decimal('0')) * DEFAULT_FACTORS['utility_kwh'] if normalized_quantity is not None else None
        scope = '2'
        if row.get('peak_kwh') and row.get('offpeak_kwh'):
            peak = _decimal(row.get('peak_kwh')) or Decimal('0')
            offpeak = _decimal(row.get('offpeak_kwh')) or Decimal('0')
            if original_quantity is not None and abs((peak + offpeak) - original_quantity) > Decimal('1'):
                flags.append('meter_subtotals_mismatch')
                suspicious_score += Decimal('15')
        if original_quantity is not None and original_quantity < 0:
            flags.append('negative_usage')
            suspicious_score += Decimal('40')
    elif source_type == 'travel':
        category = (row.get('category') or '').lower()
        activity_type = category or 'travel'
        scope = '3'
        original_quantity = _decimal(row.get('distance_km') or row.get('distance'))
        original_unit = (row.get('unit') or row.get('distance_unit') or 'km').lower()
        normalized_unit = 'km'
        if original_quantity is not None and original_unit in ('mi', 'mile', 'miles'):
            normalized_quantity = original_quantity * Decimal('1.60934')
        else:
            normalized_quantity = original_quantity
        if category == 'flight' and not normalized_quantity:
            origin = (row.get('origin_airport') or '').upper()
            destination = (row.get('destination_airport') or '').upper()
            normalized_quantity = _haversine_km(origin, destination)
            if normalized_quantity is None:
                flags.append('invalid_airport_code')
                suspicious_score += Decimal('30')
            else:
                normalized_quantity = normalized_quantity * Decimal('1.15')
        factor_key = 'flight_km' if category == 'flight' else 'hotel_night' if category == 'hotel' else 'ground_km'
        factor = DEFAULT_FACTORS[factor_key]
        emissions = (normalized_quantity or Decimal('0')) * factor if normalized_quantity is not None else None
        if row.get('category') == 'hotel' and not row.get('nights'):
            flags.append('missing_stay_duration')
            suspicious_score += Decimal('10')
    else:
        flags.append('unknown_source_type')

    if row.get('currency'):
        flags.append('currency_present')
    if row.get('duplicate_of'):
        flags.append('possible_duplicate')
        suspicious_score += Decimal('20')

    if not row.get('unit') and source_type in ('sap', 'utility'):
        flags.append('missing_unit')
        suspicious_score += Decimal('10')

    return {
        'activity_type': activity_type,
        'scope_category': scope,
        'original_quantity': original_quantity,
        'original_unit': original_unit,
        'normalized_quantity': normalized_quantity,
        'normalized_unit': normalized_unit,
        'emission_factor': _factor_for(activity_type, normalized_unit or original_unit or 'km') if emissions is not None else None,
        'emissions_kg_co2e': emissions,
        'transaction_date': transaction_date,
        'period_start': period_start,
        'period_end': period_end,
        'source_record_key': source_record_key,
        'suspicious_flags': flags,
        'suspicious_score': suspicious_score,
        'normalized_payload': {
            'activity_type': activity_type,
            'scope_category': scope,
            'normalized_unit': normalized_unit,
            'normalized_quantity': str(normalized_quantity) if normalized_quantity is not None else None,
            'emissions_kg_co2e': str(emissions) if emissions is not None else None,
        },
    }


@transaction.atomic
def ingest_csv_batch(*, organization: Organization, data_source: DataSource, uploaded_file, label: str, imported_by_email: str = '') -> ImportBatch:
    batch = ImportBatch.objects.create(
        organization=organization,
        data_source=data_source,
        label=label,
        source_filename=getattr(uploaded_file, 'name', ''),
        source_format='csv',
        imported_by_email=imported_by_email,
    )
    text = uploaded_file.read().decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    batch.total_rows = len(rows)
    for row_number, row in enumerate(rows, start=1):
        payload = {k.strip().lower(): (v or '').strip() for k, v in row.items()}
        record_hash = _hash_row(payload)
        raw_record = RawRecord.objects.create(
            organization=organization,
            import_batch=batch,
            row_number=row_number,
            source_record_key=payload.get('record_id') or payload.get('invoice_id') or payload.get('trip_id') or payload.get('belnr') or '',
            row_hash=record_hash,
            payload=payload,
        )
        normalized = normalize_row(data_source.source_type, payload)
        NormalizedEmissionRecord.objects.create(
            organization=organization,
            data_source=data_source,
            import_batch=batch,
            raw_record=raw_record,
            source_system=data_source.name,
            source_record_key=normalized['source_record_key'],
            activity_type=normalized['activity_type'],
            scope_category=normalized['scope_category'],
            original_quantity=normalized['original_quantity'],
            original_unit=normalized['original_unit'],
            normalized_quantity=normalized['normalized_quantity'],
            normalized_unit=normalized['normalized_unit'],
            emission_factor=normalized['emission_factor'],
            emissions_kg_co2e=normalized['emissions_kg_co2e'],
            currency=payload.get('currency', ''),
            transaction_date=normalized['transaction_date'],
            period_start=normalized['period_start'],
            period_end=normalized['period_end'],
            raw_payload=payload,
            normalized_payload=normalized['normalized_payload'],
            suspicious_score=normalized['suspicious_score'],
            suspicious_flags=normalized['suspicious_flags'],
        )
    batch.successful_rows = batch.normalized_records.count()
    batch.failed_rows = batch.total_rows - batch.successful_rows
    batch.status = ImportBatch.Status.PROCESSED if batch.failed_rows == 0 else ImportBatch.Status.PROCESSED
    batch.save()
    AuditEvent.objects.create(
        organization=organization,
        entity_type='ImportBatch',
        entity_id=str(batch.id),
        action='ingest',
        actor_email=imported_by_email,
        before_state={},
        after_state={'rows': batch.total_rows, 'source': data_source.source_type},
    )
    return batch


@transaction.atomic
def review_record(*, record: NormalizedEmissionRecord, decision: str, reviewer_email: str, comment: str = '', edited_payload: dict[str, Any] | None = None) -> AnalystReview:
    before_state = {
        'review_status': record.review_status,
        'normalized_payload': record.normalized_payload,
        'emissions_kg_co2e': str(record.emissions_kg_co2e) if record.emissions_kg_co2e is not None else None,
    }
    if edited_payload:
        record.normalized_payload = edited_payload
        record.edited_by_email = reviewer_email
        record.edited_at = timezone.now()
    record.review_status = decision
    if decision == NormalizedEmissionRecord.ReviewStatus.APPROVED:
        record.approved_at = timezone.now()
        record.locked_at = timezone.now()
    record.review_note = comment
    record.save()
    after_state = {
        'review_status': record.review_status,
        'normalized_payload': record.normalized_payload,
        'approved_at': record.approved_at.isoformat() if record.approved_at else None,
    }
    review = AnalystReview.objects.create(
        record=record,
        reviewer_email=reviewer_email,
        decision=record.review_status,
        comment=comment,
        before_payload=before_state,
        after_payload=after_state,
    )
    AuditEvent.objects.create(
        organization=record.organization,
        entity_type='NormalizedEmissionRecord',
        entity_id=str(record.id),
        action='review',
        actor_email=reviewer_email,
        before_state=before_state,
        after_state=after_state,
    )
    return review
