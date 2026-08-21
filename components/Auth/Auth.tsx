import React, { useEffect, useMemo } from 'react';
import { getCurrentUser } from '@/lib/appwrite';
import { observer } from 'mobx-react-lite';
import { User, UserContext } from '@/store/user';

const Auth = observer(({ children }: React.PropsWithChildren) => {
  const user = useMemo(() => new User(), []);

  useEffect(() => {
    getCurrentUser()
      .then((userData) => {
        if (userData) {
          user.login({
            session: {
              $id: userData.$id,
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
