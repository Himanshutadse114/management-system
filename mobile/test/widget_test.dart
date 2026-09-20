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
}
