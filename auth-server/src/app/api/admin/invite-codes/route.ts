import { withAdminApiRouteGuard } from '@/lib/withAdminRouteGuard'
import POST_create_handler from './POST_create_handler'

export const POST = withAdminApiRouteGuard(POST_create_handler);
