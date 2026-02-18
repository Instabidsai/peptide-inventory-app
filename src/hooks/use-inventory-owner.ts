import { useMemo } from 'react';
import { useHouseholdMembers } from './use-household';

/**
 * Returns the contact_id whose client_inventory should be queried.
 * - Solo contacts: their own ID
 * - Household members: the household owner's ID (shared fridge)
 */
export function useInventoryOwnerId(contact?: { id: string; household_id?: string | null } | null) {
    const { data: householdMembers } = useHouseholdMembers(
        contact?.household_id ? contact.id : undefined
    );

    return useMemo(() => {
        if (!contact) return undefined;
        if (!contact.household_id) return contact.id;
        const owner = householdMembers?.find(m => m.household_role === 'owner');
        return owner?.id ?? contact.id;
    }, [contact, householdMembers]);
}
