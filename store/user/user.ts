import { makeAutoObservable } from 'mobx';
import type { UserData, UserSession } from './user.types';
import { createContext } from 'react';

export class User {
  private _session: UserSession;
  private _email: string;
  private _userName: string;
  private _avatar: string;

  constructor() {
    // Initialize with default values
    this._session = { $id: '', isLoggedIn: false };
    this._email = '';
    this._userName = '';
    this._avatar = '';
    makeAutoObservable(this);
  }

  login(userData: UserData): void {
    this._session = userData.session;
    this._email = userData.email;
    this._userName = userData.userName;
    this._avatar = userData.avatar;
  }

  logout(): void {
    this._session = { $id: '', isLoggedIn: false };
    this._email = '';
    this._userName = '';
    this._avatar = '';
  }

  // Getters
  get isLoggedIn(): boolean {
    return this._session.isLoggedIn;
  }

  get userId(): string {
    return this._session.$id;
  }

  get email(): string {
    return this._email;
  }

  get userName(): string {
    return this._userName;
  }

  get avatar(): string {
    return this._avatar;
  }

  // Get all user data
  get userData(): UserData {
    return {
      session: { ...this._session },
      email: this._email,
      userName: this._userName,
      avatar: this._avatar,
    };
  }
}

export const UserContext = createContext<User>(new User());
