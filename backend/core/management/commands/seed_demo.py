from django.core.management.base import BaseCommand
from core.models import DataSource, EmissionFactorReference, Facility, Membership, Organization, UnitConversion
from core.services import ingest_csv_batch
from pathlib import Path


class Command(BaseCommand):
    help = 'Seed a demo organization and ingest realistic source files.'

    def handle(self, *args, **options):
        base_dir = Path(__file__).resolve().parents[3]
        sample_dir = base_dir / 'sample-data'
        organization, _ = Organization.objects.get_or_create(
            slug='breathe-demo',
            defaults={'name': 'Breathe Demo', 'default_currency': 'USD'},
        )
        Membership.objects.get_or_create(organization=organization, email='admin@breathe.local', defaults={'role': Membership.Role.ADMIN})
        Membership.objects.get_or_create(organization=organization, email='analyst@breathe.local', defaults={'role': Membership.Role.ANALYST})
        Membership.objects.get_or_create(organization=organization, email='viewer@breathe.local', defaults={'role': Membership.Role.VIEWER})
        sap_source, _ = DataSource.objects.get_or_create(
            organization=organization,
            source_type='sap',
            name='SAP ECC Fuel and Procurement Export',
            defaults={'ingestion_mode': 'csv_upload', 'system_of_record': 'SAP ECC'},
        )
        utility_source, _ = DataSource.objects.get_or_create(
            organization=organization,
            source_type='utility',
            name='Utility Portal Electricity Export',
            defaults={'ingestion_mode': 'csv_upload', 'system_of_record': 'Utility Portal'},
        )
        travel_source, _ = DataSource.objects.get_or_create(
            organization=organization,
            source_type='travel',
            name='Concur Travel Export',
            defaults={'ingestion_mode': 'csv_upload', 'system_of_record': 'Concur'},
        )
        Facility.objects.get_or_create(organization=organization, external_code='PLANT-001', defaults={'name': 'Pune Plant', 'plant_code': '1001', 'meter_id': 'MTR-7781', 'country': 'IN'})
        Facility.objects.get_or_create(organization=organization, external_code='HQ-001', defaults={'name': 'Bengaluru HQ', 'meter_id': 'MTR-1102', 'country': 'IN'})
        UnitConversion.objects.get_or_create(from_unit='gallon', to_unit='liter', defaults={'factor': '3.78541', 'domain': 'fuel'})
        UnitConversion.objects.get_or_create(from_unit='mwh', to_unit='kwh', defaults={'factor': '1000', 'domain': 'electricity'})
        for activity_type, unit, factor, scope in [
            ('electricity', 'kwh', '0.42', '2'),
            ('flight', 'km', '0.15', '3'),
            ('hotel', 'night', '12.50', '3'),
            ('ground', 'km', '0.09', '3'),
            ('procurement', 'usd', '0.18', '3'),
        ]:
            EmissionFactorReference.objects.get_or_create(
                organization=organization,
                activity_type=activity_type,
                unit=unit,
                defaults={'factor_value': factor, 'scope_category': scope, 'source_system': 'demo'}
            )
        samples = [
            (sap_source, sample_dir / 'sap_fuel_procurement.csv', 'SAP Fuel and Procurement March 2026'),
            (utility_source, sample_dir / 'utility_electricity.csv', 'Utility Electricity April 2026'),
            (travel_source, sample_dir / 'travel_concur.csv', 'Travel Export April 2026'),
        ]
        for source, path, label in samples:
            with path.open('rb') as handle:
                ingest_csv_batch(organization=organization, data_source=source, uploaded_file=handle, label=label, imported_by_email='seed@breathe.local')
        self.stdout.write(self.style.SUCCESS('Demo data seeded'))
