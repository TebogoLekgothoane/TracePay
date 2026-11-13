import { Octicons } from "@expo/vector-icons";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { View } from "react-native";

export type DocumentActionsMenuAction = {
  action: string;
  label: string;
  callback: () => void | Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
  icon?: unknown;
};

type DocumentActionsMenuProps = {
  actions: DocumentActionsMenuAction[];
  disabled?: boolean;
  foregroundColor: string;
  mutedColor: string;
  /** Trigger diameter in px. Defaults to 40; list cards use 32. */
  size?: number;
};

export function DocumentActionsMenu({
  actions: documentActions,
  disabled = false,
  foregroundColor,
  mutedColor,
  size = 40,
}: DocumentActionsMenuProps) {
  const menuDisabled = disabled || documentActions.length === 0;
  const actions: MenuAction[] = documentActions.map((action) => ({
    id: action.action,
    title: action.label,
    attributes: { destructive: action.destructive, disabled: action.disabled },
  }));

  const trigger = (
    <View
      className="items-center justify-center rounded-full border border-border bg-card"
      style={{ height: size, width: size }}
    >
      <Octicons
        name="kebab-horizontal"
        size={Math.round(size * 0.45)}
        color={menuDisabled ? mutedColor : foregroundColor}
      />
    </View>
  );

  if (menuDisabled) {
    return <View className="shrink-0 opacity-50">{trigger}</View>;
  }

  return (
    <View className="shrink-0">
      <MenuView
        actions={actions}
        onPressAction={({ nativeEvent }) => {
          const selectedAction = documentActions.find(
            (action) => action.action === nativeEvent.event,
          );
          if (selectedAction && !selectedAction.disabled) {
            void selectedAction.callback();
          }
        }}
      >
        {trigger}
      </MenuView>
    </View>
  );
}
