import { Card, Badge, Text, BlockStack, InlineStack } from '@shopify/polaris';
import type { SerializeFrom } from '@remix-run/node';
import type { SyncJob } from '@prisma/client';

// Jobs arrive from a Remix loader, so Date fields are serialized to strings.
type SerializedSyncJob = SerializeFrom<SyncJob>;

interface ActivityLogProps {
  jobs: SerializedSyncJob[];
}

export function ActivityLog({ jobs }: ActivityLogProps) {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Recent Activity
        </Text>

        {jobs.length === 0 ? (
          <Text as="p" tone="subdued">
            No sync activity yet
          </Text>
        ) : (
          <BlockStack gap="300">
            {jobs.map((job) => (
              <InlineStack key={job.id} align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge
                      tone={
                        job.status === 'completed' ? 'success' :
                        job.status === 'failed' ? 'critical' :
                        job.status === 'running' ? 'info' : 'warning'
                      }
                    >
                      {job.status}
                    </Badge>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {job.jobType.replace(/_/g, ' ')}
                    </Text>
                  </InlineStack>

                  {job.status === 'completed' && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {job.productsSynced} products, {job.variantsSynced} variants
                    </Text>
                  )}

                  {job.status === 'failed' && job.errors && (
                    <Text as="span" variant="bodySm" tone="critical">
                      {(job.errors as { message?: string }).message}
                    </Text>
                  )}
                </BlockStack>

                <Text as="span" variant="bodySm" tone="subdued">
                  {formatRelativeTime(job.startedAt)}
                </Text>
              </InlineStack>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

function formatRelativeTime(date: string | Date): string {
  const timestamp = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
