import 'package:deva/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the Deva brand mark', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: DevaMark(size: 48))),
    );
    expect(find.byIcon(Icons.layers_rounded), findsOneWidget);
  });

  test('download names are safe and retain report extensions', () {
    expect(safeDownloadName('daily/report?.pdf'), 'daily_report_.pdf');
    expect(safeDownloadName('  '), 'deva-download');
    expect(safeDownloadName('closing-report.xlsx'), 'closing-report.xlsx');
  });

  test('download data URLs decode into their original bytes', () {
    expect(decodeDownloadDataUrl('data:application/pdf;base64,JVBERg=='), <int>[
      37,
      80,
      68,
      70,
    ]);
    expect(
      () => decodeDownloadDataUrl('missing-content'),
      throwsA(isA<FormatException>()),
    );
  });
}
