import { useColorScheme } from "nativewind";
import { ScrollView, Text, View } from "react-native";

import {
  BANK_ACCOUNT_LISTINGS,
  BANK_COMPARISON_AS_OF,
  BANK_COMPARISON_DISCLAIMER,
  CURRENT_MONTHLY_FEE,
} from "../../features/leaks/bank-comparison";
import { formatRandAmount, parseRandAmount } from "../../utils/currency";
import { COLORS, withAlpha } from "../../theme/colors";
import { BrandLogo } from "../ui/BrandLogo";

const ROW_HEIGHT = 64;
const NAME_COLUMN_WIDTH = 148;
const TABLE_COLUMNS = [
  { key: "monthlyFee", label: "Monthly fee", width: 96 },
  { key: "difference", label: "vs your fee", width: 104 },
  { key: "pricing", label: "Pricing", width: 156 },
  { key: "debitOrders", label: "Debit orders", width: 132 },
  { key: "channel", label: "Access", width: 112 },
] as const;

type TableRow = {
  id: string;
  bank: string;
  account: string;
  logoDomain?: string;
  mark: string;
  cells: Record<(typeof TABLE_COLUMNS)[number]["key"], string>;
  current?: boolean;
};

/** Side-by-side SA bank account fees. Display only, no recommendation. */
export function BankComparisonTable() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const currentFee = parseRandAmount(CURRENT_MONTHLY_FEE);
  const rows: TableRow[] = [
    {
      id: "current",
      bank: "Your account",
      account: "Current monthly fee",
      mark: "You",
      current: true,
      cells: {
        monthlyFee: CURRENT_MONTHLY_FEE,
        difference: "—",
        pricing: "—",
        debitOrders: "—",
        channel: "—",
      },
    },
    ...[...BANK_ACCOUNT_LISTINGS]
      .sort(
        (a, b) => parseRandAmount(a.monthlyFee) - parseRandAmount(b.monthlyFee),
      )
      .map((listing) => {
        const diff = parseRandAmount(listing.monthlyFee) - currentFee;
        return {
          id: listing.id,
          bank: listing.bank,
          account: listing.account,
          logoDomain: listing.logoDomain,
          mark: listing.mark,
          cells: {
            monthlyFee: listing.monthlyFee,
            difference: `${diff < 0 ? "−" : "+"}${formatRandAmount(Math.abs(diff))}/mo`,
            pricing: listing.pricing,
            debitOrders: listing.debitOrders,
            channel: listing.channel,
          },
        };
      }),
  ];

  const rowStyle = (row: TableRow, index: number) => ({
    height: ROW_HEIGHT,
    backgroundColor: row.current
      ? withAlpha(palette.primary, 0.1)
      : index % 2 === 0
        ? "transparent"
        : withAlpha(palette.foreground, 0.03),
  });

  return (
    <View>
      <View className="mt-5 flex-row overflow-hidden rounded-3xl bg-card">
        <View style={{ width: NAME_COLUMN_WIDTH }}>
          <View className="justify-center px-3 py-2.5">
            <Text className="text-[11px] font-semibold text-muted-foreground">
              Bank
            </Text>
          </View>
          {rows.map((row, index) => (
            <View
              key={row.id}
              className="flex-row items-center gap-2 px-3"
              style={rowStyle(row, index)}
            >
              {row.logoDomain ? (
                <BrandLogo
                  name={row.bank}
                  logoDomain={row.logoDomain}
                  size={28}
                  fallbackColor={palette.primary}
                  shape="squircle"
                />
              ) : null}
              <View className="min-w-0 flex-1">
                <Text
                  className="text-[12px] font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {row.bank}
                </Text>
                <Text
                  className="text-[11px] text-muted-foreground"
                  numberOfLines={1}
                >
                  {row.account}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View className="flex-row py-2.5">
              {TABLE_COLUMNS.map((column) => (
                <Text
                  key={column.key}
                  className="px-2 text-[11px] font-semibold text-muted-foreground"
                  style={{ width: column.width }}
                >
                  {column.label}
                </Text>
              ))}
            </View>
            {rows.map((row, index) => (
              <View
                key={row.id}
                className="flex-row items-center"
                style={rowStyle(row, index)}
              >
                {TABLE_COLUMNS.map((column) => (
                  <Text
                    key={column.key}
                    className={`px-2 text-[12px] ${
                      column.key === "monthlyFee" ? "font-bold" : "font-medium"
                    } text-foreground`}
                    style={{ width: column.width }}
                    numberOfLines={2}
                  >
                    {row.cells[column.key]}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <View className="mt-4 rounded-3xl bg-muted p-4">
        <Text className="text-[12px] font-semibold text-foreground">
          About these figures · {BANK_COMPARISON_AS_OF}
        </Text>
        <Text className="mt-1 text-[12px] leading-5 text-muted-foreground">
          {BANK_COMPARISON_DISCLAIMER}
        </Text>
      </View>
    </View>
  );
}
