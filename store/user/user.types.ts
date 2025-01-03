export interface UserType {
  session: {
    $id?: string;
    isLoggedIn: boolean;
  };
  email: string;
  userName: string;
  avatar: string;
}

export interface UserSession {
  $id: string;
  isLoggedIn: boolean;
}

export interface UserData {
  session: UserSession;
  email: string;
  userName: string;
  avatar: string;
}
