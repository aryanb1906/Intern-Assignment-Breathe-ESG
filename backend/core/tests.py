from pathlib import Path

from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import DataSource, Membership, NormalizedEmissionRecord, Organization


class CoreApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)

    def setUp(self):
        self.organization = Organization.objects.get(slug='breathe-demo')
        self.admin_email = 'admin@breathe.local'
        self.analyst_email = 'analyst@breathe.local'
        self.viewer_email = 'viewer@breathe.local'

    def headers(self, email: str):
        return {
            'HTTP_X_BREATHE_ORGANIZATION': self.organization.slug,
            'HTTP_X_BREATHE_EMAIL': email,
        }

    def test_session_endpoint_returns_permissions(self):
        response = self.client.get('/api/session/', {'organization': self.organization.slug, 'email': self.analyst_email}, **self.headers(self.analyst_email))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['membership']['role'], Membership.Role.ANALYST)
        self.assertTrue(response.data['permissions']['can_review'])
        self.assertFalse(response.data['permissions']['can_upload'])

    def test_dashboard_endpoint_returns_seeded_counts(self):
        response = self.client.get('/api/dashboard/', {'organization': self.organization.slug}, **self.headers(self.analyst_email))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['total_records'], 22)
        self.assertEqual(response.data['summary']['pending_review'], 22)
        self.assertEqual(response.data['summary']['suspicious_rows'], 14)
        self.assertEqual(response.data['summary']['approved_rows'], 0)
        self.assertEqual(len(response.data['recent_batches']), 3)

    def test_upload_and_review_flow(self):
        sap_source = DataSource.objects.get(organization=self.organization, source_type='sap')
        sample_path = Path(__file__).resolve().parents[1] / 'sample-data' / 'sap_fuel_procurement.csv'
        payload = SimpleUploadedFile('sap_fuel_procurement.csv', sample_path.read_bytes(), content_type='text/csv')

        upload_response = self.client.post(
            '/api/import-batches/upload/',
            {
                'organization_slug': self.organization.slug,
                'data_source_id': str(sap_source.id),
                'label': 'Unit Test SAP Upload',
                'imported_by_email': self.admin_email,
                'file': payload,
            },
            format='multipart',
            **self.headers(self.admin_email),
        )
        self.assertEqual(upload_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(upload_response.data['label'], 'Unit Test SAP Upload')

        record = NormalizedEmissionRecord.objects.filter(organization=self.organization, review_status=NormalizedEmissionRecord.ReviewStatus.PENDING).first()
        self.assertIsNotNone(record)

        review_response = self.client.post(
            f'/api/records/{record.id}/review/?organization={self.organization.slug}',
            {
                'decision': 'approved',
                'comment': 'unit test approval',
                'normalized_payload': record.normalized_payload,
            },
            format='json',
            **self.headers(self.analyst_email),
        )
        self.assertEqual(review_response.status_code, status.HTTP_200_OK)

        record.refresh_from_db()
        self.assertEqual(record.review_status, NormalizedEmissionRecord.ReviewStatus.APPROVED)

    def test_seed_endpoint_rejects_viewer(self):
        response = self.client.post(
            '/api/demo/seed/',
            {'organization_slug': self.organization.slug, 'email': self.viewer_email},
            format='json',
            **self.headers(self.viewer_email),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)