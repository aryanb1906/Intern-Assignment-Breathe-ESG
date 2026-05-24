from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    AnalystReviewViewSet,
    AuditEventViewSet,
    DashboardAPIView,
    DataSourceViewSet,
    DemoSeedAPIView,
    ImportBatchViewSet,
    NormalizedRecordViewSet,
    OrganizationViewSet,
    SessionAPIView,
    OverviewAPIView,
    RawRecordViewSet,
)

router = DefaultRouter()
router.register(r'organizations', OrganizationViewSet)
router.register(r'data-sources', DataSourceViewSet)
router.register(r'import-batches', ImportBatchViewSet)
router.register(r'raw-records', RawRecordViewSet, basename='raw-records')
router.register(r'records', NormalizedRecordViewSet, basename='records')
router.register(r'reviews', AnalystReviewViewSet, basename='reviews')
router.register(r'audit-events', AuditEventViewSet, basename='audit-events')

urlpatterns = [
    path('', OverviewAPIView.as_view()),
    path('dashboard/', DashboardAPIView.as_view()),
    path('session/', SessionAPIView.as_view()),
    path('demo/seed/', DemoSeedAPIView.as_view()),
    path('', include(router.urls)),
]
