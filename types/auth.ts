export interface User {
  id: number;
  email: string;
  name?: string;
  image?: string;
  emailVerified?: Date;
  favoriteTeams?: string;
  preferredLeague?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  user: User;
  token: string;
  expires: Date;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends AuthCredentials {
  name: string;
}
