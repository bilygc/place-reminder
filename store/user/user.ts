import { makeAutoObservable } from "mobx";
export class User {
  email: string;
  userName: string;
  avatar: string;
  accountId: string;

  // Using readonly for immutable properties
  constructor(
    email: string,
    userName: string,
    avatar: string,
    accountId: string
  ) {
    this.email = email;
    this.userName = userName;
    this.avatar = avatar;
    this.accountId = accountId;
    makeAutoObservable(this);
  }

  // Using a getter instead of a method
  get getUser() {
    return {
      userName: this.userName,
      email: this.email,
      avatar: this.avatar,
      accountId: this.accountId,
    } as const; // Adding const assertion for immutability
  }

  changeEmail(newEmail: string) {
    this.email = newEmail;
  }
}
