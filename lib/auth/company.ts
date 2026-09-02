import { getCurrentUser } from '@/lib/api';

export async function getUserCompanyId(): Promise<number | null> {
    const { data: user } = await getCurrentUser();
    return user?.companyId ?? null;
}

