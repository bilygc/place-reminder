import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, Pressable } from 'react-native';
import { observer } from 'mobx-react-lite';

// TODO: This component is experimental / not yet wired up to a real screen.
// It expects a MobX user store shape (with `user.changeEmail` and
// `user.getUser` methods) that doesn't exist yet in store/user/user.types.ts
// — that file only exports plain data shapes (UserType, UserSession,
// UserData), not a store with methods. Replace this local type with the
// real store type once that store is implemented.
interface TableUserStoreShape {
  user: {
    email: string;
    userName: string;
    changeEmail: (email: string) => void;
    getUser: unknown;
  };
}

const Table = observer((user: TableUserStoreShape) => {
  const [email, setEmail] = useState(user.user.email || '');

  return (
    <FlatList
      data={[user.user]}
      renderItem={({ item }: { item: TableUserStoreShape['user'] }) => (
        <View>
          <Text>{item.userName}</Text>
          <Text>{item.email}</Text>
          <Text>{email}</Text>
          <View>
            <Text>Change email</Text>
            <TextInput
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.nativeEvent.text)}
            />
            <Pressable onPress={() => user.user.changeEmail(email)}>
              <Text>{'\n'}Change email</Text>
            </Pressable>
            <Pressable onPress={() => console.log(user.user.getUser)}>
              <Text>{'\n'}Get User</Text>
            </Pressable>
          </View>
        </View>
      )}
      keyExtractor={(item: TableUserStoreShape['user']) => item.userName}
      ListEmptyComponent={() => <Text>Empty</Text>}
    />
  );
});
export default Table;