import React, { useState } from "react";
import { View, Text, FlatList, TextInput, Pressable } from "react-native";
import { observer } from "mobx-react-lite";
import type { User } from "@/store/user/user.types";

const Table = observer((user: User) => {
  const [email, setEmail] = useState(user.user.email || "");

  return (
    <FlatList
      data={[user.user]}
      renderItem={({ item }: { item: User["user"] }) => (
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
              <Text>{"\n"}Change email</Text>
            </Pressable>
            <Pressable onPress={() => console.log(user.user.getUser)}>
              <Text>{"\n"}Get User</Text>
            </Pressable>
          </View>
        </View>
      )}
      keyExtractor={(item: User["user"]) => item.userName}
      ListEmptyComponent={() => <Text>Empty</Text>}
    />
  );
});
export default Table;
