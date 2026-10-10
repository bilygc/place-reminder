import React, { useEffect, useMemo } from 'react';
import { getCurrentUser } from '@/lib/appwrite';
import { resolveSessionAccountId } from '@/lib/sessionIdentity';
import { observer } from 'mobx-react-lite';
import { User, UserContext } from '@/store/user';

const Auth = observer(({ children }: React.PropsWithChildren) => {
  const user = useMemo(() => new User(), []);

  useEffect(() => {
    getCurrentUser()
      .then((userData) => {
        if (userData) {
          // Session identity is the Appwrite ACCOUNT id
          // (userData.accountid), not the user-document $id — createReminder
          // derives ownership from account.get() and rejects a mismatched
          // caller id. A missing accountid throws into the catch below (logged,
          // stays logged out), never silently falling back to the document id.
          user.login({
            session: {
              $id: resolveSessionAccountId(userData),
              isLoggedIn: true,
            },
            email: userData.email,
            userName: userData.email,
            avatar: userData.avatar,
          });
        }
      })
      .catch((error) => {
        console.error('Unexpected auth initialization error:', error);
      });
  }, [user]);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
});

export default Auth;
